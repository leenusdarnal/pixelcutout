/** @typedef {{ width: number, height: number }} ImageDimensions */

const HEADER_READ_LIMIT = 2 * 1024 * 1024;

export const MAX_IMAGE_PIXELS = 16_000_000;
export const MAX_IMAGE_DIMENSION = 10_000;

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** @param {Uint8Array} bytes @param {number} offset @param {string} value @returns {boolean} */
function matchesAscii(bytes, offset, value) {
  if (offset + value.length > bytes.length) return false;
  for (let i = 0; i < value.length; i += 1) {
    if (bytes[offset + i] !== value.charCodeAt(i)) return false;
  }
  return true;
}

/** @param {Uint8Array} bytes @returns {boolean} */
function isPng(bytes) {
  return PNG_SIGNATURE.every((byte, index) => bytes[index] === byte);
}

/** @param {Uint8Array} bytes @returns {ImageDimensions | null} */
function readPngDimensions(bytes) {
  if (bytes.length < 24 || !isPng(bytes) || !matchesAscii(bytes, 12, 'IHDR')) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return {
    width: view.getUint32(16, false),
    height: view.getUint32(20, false)
  };
}

/** @param {Uint8Array} bytes @returns {boolean} */
function isJpeg(bytes) {
  return bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8;
}

/** @param {number} marker @returns {boolean} */
function isStartOfFrame(marker) {
  return [
    0xc0, 0xc1, 0xc2, 0xc3,
    0xc5, 0xc6, 0xc7,
    0xc9, 0xca, 0xcb,
    0xcd, 0xce, 0xcf
  ].includes(marker);
}

/** @param {Uint8Array} bytes @returns {ImageDimensions | null} */
function readJpegDimensions(bytes) {
  if (!isJpeg(bytes)) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 2;

  while (offset < bytes.length) {
    // JPEG segments are each introduced by one or more 0xff bytes.
    while (offset < bytes.length && bytes[offset] !== 0xff) offset += 1;
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.length) break;

    const marker = bytes[offset];
    offset += 1;

    // Standalone markers have no length field.
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      continue;
    }

    if (offset + 2 > bytes.length) break;
    const segmentLength = view.getUint16(offset, false);
    if (segmentLength < 2 || offset + segmentLength > bytes.length) break;

    if (isStartOfFrame(marker)) {
      if (segmentLength < 7) return null;
      return {
        height: view.getUint16(offset + 3, false),
        width: view.getUint16(offset + 5, false)
      };
    }

    // Start of scan means compressed image data follows; dimensions should already exist.
    if (marker === 0xda) break;
    offset += segmentLength;
  }

  return null;
}

/** @param {Uint8Array} bytes @returns {ImageDimensions | null} */
function readWebpDimensions(bytes) {
  if (
    bytes.length < 30 ||
    !matchesAscii(bytes, 0, 'RIFF') ||
    !matchesAscii(bytes, 8, 'WEBP')
  ) return null;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const chunk = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);

  if (chunk === 'VP8X') {
    const width = 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16);
    const height = 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16);
    return { width, height };
  }

  if (chunk === 'VP8 ') {
    if (
      bytes.length < 30 ||
      bytes[23] !== 0x9d ||
      bytes[24] !== 0x01 ||
      bytes[25] !== 0x2a
    ) return null;

    return {
      width: view.getUint16(26, true) & 0x3fff,
      height: view.getUint16(28, true) & 0x3fff
    };
  }

  if (chunk === 'VP8L') {
    if (bytes[20] !== 0x2f) return null;
    const b1 = bytes[21];
    const b2 = bytes[22];
    const b3 = bytes[23];
    const b4 = bytes[24];
    return {
      width: 1 + b1 + ((b2 & 0x3f) << 8),
      height: 1 + ((b2 >> 6) & 0x03) + (b3 << 2) + ((b4 & 0x0f) << 10)
    };
  }

  return null;
}

/**
 * Reads only a small prefix of an image file to determine its intrinsic dimensions.
 * This avoids decoding or allocating a full-resolution bitmap just to validate the file.
 */
/** @param {Blob} file @returns {Promise<ImageDimensions>} */
export async function readImageDimensions(file) {
  if (!file || typeof file.slice !== 'function' || !Number.isFinite(file.size)) {
    throw new TypeError('A valid image file is required.');
  }

  const bytes = new Uint8Array(await file.slice(0, HEADER_READ_LIMIT).arrayBuffer());
  /** @type {ImageDimensions | null} */
  let dimensions = null;

  if (file.type === 'image/png') dimensions = readPngDimensions(bytes);
  else if (file.type === 'image/jpeg') dimensions = readJpegDimensions(bytes);
  else if (file.type === 'image/webp') dimensions = readWebpDimensions(bytes);

  if (
    !dimensions ||
    !Number.isSafeInteger(dimensions.width) ||
    !Number.isSafeInteger(dimensions.height) ||
    dimensions.width < 1 ||
    dimensions.height < 1
  ) {
    throw new Error('This file is not a valid PNG, JPG, or WebP image.');
  }

  return dimensions;
}

/** @param {ImageDimensions} dimensions */
export function validateImageDimensions(dimensions) {
  const { width, height } = dimensions;
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width < 1 ||
    height < 1
  ) {
    throw new Error('The image has invalid dimensions.');
  }

  if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
    throw new Error(`Images cannot be wider or taller than ${MAX_IMAGE_DIMENSION.toLocaleString()} pixels.`);
  }

  if (width * height > MAX_IMAGE_PIXELS) {
    throw new Error(`Images are limited to ${(MAX_IMAGE_PIXELS / 1_000_000).toLocaleString()} megapixels to protect device memory.`);
  }
}
