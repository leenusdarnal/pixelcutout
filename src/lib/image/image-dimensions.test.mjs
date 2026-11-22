import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_IMAGE_DIMENSION,
  MAX_IMAGE_PIXELS,
  readImageDimensions,
  validateImageDimensions
} from './image-dimensions.js';

function ascii(bytes, offset, value) {
  for (let index = 0; index < value.length; index += 1) {
    bytes[offset + index] = value.charCodeAt(index);
  }
}

function png(width, height) {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  ascii(bytes, 12, 'IHDR');
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width, false);
  view.setUint32(20, height, false);
  return new Blob([bytes], { type: 'image/png' });
}

function jpeg(width, height) {
  const bytes = new Uint8Array([
    0xff, 0xd8, // SOI
    0xff, 0xc0, // Baseline SOF
    0x00, 0x0b, // Segment length
    0x08,
    (height >> 8) & 0xff, height & 0xff,
    (width >> 8) & 0xff, width & 0xff,
    0x03, 0x01, 0x11, 0x00,
    0xff, 0xd9
  ]);
  return new Blob([bytes], { type: 'image/jpeg' });
}

function webpExtended(width, height) {
  const bytes = new Uint8Array(30);
  ascii(bytes, 0, 'RIFF');
  ascii(bytes, 8, 'WEBP');
  ascii(bytes, 12, 'VP8X');
  const w = width - 1;
  const h = height - 1;
  bytes[24] = w & 0xff;
  bytes[25] = (w >> 8) & 0xff;
  bytes[26] = (w >> 16) & 0xff;
  bytes[27] = h & 0xff;
  bytes[28] = (h >> 8) & 0xff;
  bytes[29] = (h >> 16) & 0xff;
  return new Blob([bytes], { type: 'image/webp' });
}

test('reads PNG dimensions from its IHDR header without decoding pixels', async () => {
  assert.deepEqual(await readImageDimensions(png(2048, 1024)), { width: 2048, height: 1024 });
});

test('reads JPEG dimensions from a Start Of Frame segment', async () => {
  assert.deepEqual(await readImageDimensions(jpeg(4000, 3000)), { width: 4000, height: 3000 });
});

test('reads WebP extended dimensions from the VP8X header', async () => {
  assert.deepEqual(await readImageDimensions(webpExtended(1920, 1080)), { width: 1920, height: 1080 });
});

test('rejects a type and signature mismatch or malformed header', async () => {
  await assert.rejects(readImageDimensions(new Blob(['not an image'], { type: 'image/png' })), /not a valid PNG/);
  await assert.rejects(readImageDimensions(new Blob(['not an image'], { type: 'image/jpeg' })), /not a valid PNG/);
  await assert.rejects(readImageDimensions(new Blob(['not an image'], { type: 'image/webp' })), /not a valid PNG/);
});

test('accepts dimensions at the configured limits', () => {
  assert.doesNotThrow(() => validateImageDimensions({ width: 4000, height: 4000 }));
  assert.equal(MAX_IMAGE_PIXELS, 16_000_000);
  assert.equal(MAX_IMAGE_DIMENSION, 10_000);
});

test('rejects pixel counts above the configured limit', () => {
  assert.throws(() => validateImageDimensions({ width: 5000, height: 4000 }), /16 megapixels/);
});

test('rejects one oversized side even when total pixel count is under the limit', () => {
  assert.throws(() => validateImageDimensions({ width: 10_001, height: 100 }), /10,000 pixels/);
});

test('rejects zero, negative, fractional and non-finite dimensions', () => {
  for (const dimensions of [
    { width: 0, height: 10 },
    { width: -1, height: 10 },
    { width: 1.5, height: 10 },
    { width: Number.POSITIVE_INFINITY, height: 10 }
  ]) {
    assert.throws(() => validateImageDimensions(dimensions), /invalid dimensions/);
  }
});
