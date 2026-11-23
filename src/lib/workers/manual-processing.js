import { removeColorPixels } from '../image/remove-color.js';

/**
 * Apply the manual colour-removal operation to the full-resolution source in
 * a dedicated worker. Runtime APIs are injectable so allocation and cleanup
 * paths can be covered without adding a browser-test dependency.
 *
 * @param {Blob} file
 * @param {{r:number,g:number,b:number}} color
 * @param {number} tolerance
 * @param {{
 *   createImageBitmap?: (source: Blob) => Promise<ImageBitmap>,
 *   OffscreenCanvas?: new (width:number,height:number) => OffscreenCanvas,
 *   Blob?: typeof Blob
 * }} runtime
 * @returns {Promise<Blob>}
 */
export async function removeSampledColor(
  file,
  color,
  tolerance,
  runtime = globalThis
) {
  const createBitmap = runtime.createImageBitmap;
  const Canvas = runtime.OffscreenCanvas;
  const BlobConstructor = runtime.Blob ?? Blob;

  if (typeof createBitmap !== 'function' || typeof Canvas !== 'function') {
    throw new Error(
      'This browser does not support full-resolution manual colour removal in its image worker. Please use a recent version of Chrome, Edge, or Firefox.'
    );
  }

  const bitmap = await createBitmap(file);
  let canvas;
  let imageData;

  try {
    canvas = new Canvas(bitmap.width, bitmap.height);
    const context = canvas.getContext('2d', { willReadFrequently: true });

    if (!context) {
      throw new Error(
        'This browser could not create a local image-processing canvas. Please use a recent version of Chrome, Edge, or Firefox.'
      );
    }

    context.drawImage(bitmap, 0, 0);
    imageData = context.getImageData(0, 0, bitmap.width, bitmap.height);

    if (!(imageData?.data instanceof Uint8ClampedArray) || imageData.data.length !== bitmap.width * bitmap.height * 4) {
      throw new Error('The browser returned an invalid image frame for manual colour removal.');
    }

    removeColorPixels(imageData.data, color, tolerance);
    context.putImageData(imageData, 0, 0);

    const result = await canvas.convertToBlob({ type: 'image/png' });
    if (!(result instanceof BlobConstructor) || result.size === 0) {
      throw new Error('The browser could not encode the manual-removal result as a PNG.');
    }

    return result;
  } finally {
    // Clear uncompressed pixels and release GPU/bitmap-backed memory on both
    // success and failure. The returned Blob owns the encoded PNG bytes.
    imageData?.data.fill(0);

    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
    }

    bitmap.close();
  }
}
