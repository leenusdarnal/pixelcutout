import test from 'node:test';
import assert from 'node:assert/strict';
import { removeSampledColor } from './manual-processing.js';

const green = { r: 0, g: 255, b: 0 };

function makeRuntime({
  pixels = [0, 255, 0, 255, 255, 0, 0, 255],
  width = 2,
  height = 1,
  contextAvailable = true,
  encodeError
} = {}) {
  const events = [];
  const file = new Blob(['synthetic source']);
  const frameData = new Uint8ClampedArray(pixels);
  let canvasInstance;
  let bitmapClosed = false;
  let encodedPixels;

  const bitmap = {
    width,
    height,
    close() {
      bitmapClosed = true;
      events.push('bitmap-close');
    }
  };

  class FakeOffscreenCanvas {
    constructor(canvasWidth, canvasHeight) {
      this.width = canvasWidth;
      this.height = canvasHeight;
      canvasInstance = this;
      events.push(['canvas-create', canvasWidth, canvasHeight]);
    }

    getContext(type, options) {
      events.push(['get-context', type, options?.willReadFrequently]);
      if (!contextAvailable) return null;

      return {
        drawImage(source, x, y) {
          assert.equal(source, bitmap);
          assert.equal(x, 0);
          assert.equal(y, 0);
          events.push('draw-image');
        },
        getImageData(x, y, imageWidth, imageHeight) {
          assert.deepEqual([x, y, imageWidth, imageHeight], [0, 0, width, height]);
          events.push('get-image-data');
          return { data: frameData, width, height };
        },
        putImageData(imageData, x, y) {
          assert.equal(imageData.data, frameData);
          assert.deepEqual([x, y], [0, 0]);
          encodedPixels = [...imageData.data];
          events.push('put-image-data');
        }
      };
    }

    async convertToBlob(options) {
      events.push(['convert-to-blob', options.type]);
      if (encodeError) throw encodeError;
      return new Blob(['encoded synthetic PNG'], { type: options.type });
    }
  }

  return {
    file,
    events,
    bitmap,
    get bitmapClosed() { return bitmapClosed; },
    get canvasInstance() { return canvasInstance; },
    get frameData() { return frameData; },
    get encodedPixels() { return encodedPixels; },
    runtime: {
      Blob,
      OffscreenCanvas: FakeOffscreenCanvas,
      async createImageBitmap(source) {
        assert.equal(source, file);
        events.push('create-image-bitmap');
        return bitmap;
      }
    }
  };
}

test('processes the full-resolution frame and preserves foreground pixels', async () => {
  const harness = makeRuntime();
  const result = await removeSampledColor(harness.file, green, 48, harness.runtime);

  assert.ok(result instanceof Blob);
  assert.equal(result.type, 'image/png');
  assert.deepEqual(harness.encodedPixels, [
    0, 255, 0, 0,
    255, 0, 0, 255
  ]);
  assert.deepEqual(harness.events[1], ['canvas-create', 2, 1]);
  assert.equal(harness.bitmapClosed, true);
  assert.deepEqual([harness.canvasInstance.width, harness.canvasInstance.height], [0, 0]);
  assert.ok(harness.frameData.every((channel) => channel === 0),
    'temporary ImageData memory should be cleared after encoding');
});

test('does not allocate a bitmap when worker canvas APIs are unavailable', async () => {
  const harness = makeRuntime();
  const runtime = { Blob, createImageBitmap: harness.runtime.createImageBitmap };

  await assert.rejects(
    removeSampledColor(harness.file, green, 48, runtime),
    /does not support full-resolution manual colour removal/
  );

  assert.equal(harness.events.includes('create-image-bitmap'), false);
  assert.equal(harness.bitmapClosed, false);
});

test('closes the bitmap and clears the canvas when a 2D context is unavailable', async () => {
  const harness = makeRuntime({ contextAvailable: false });

  await assert.rejects(
    removeSampledColor(harness.file, green, 48, harness.runtime),
    /could not create a local image-processing canvas/
  );

  assert.equal(harness.bitmapClosed, true);
  assert.deepEqual([harness.canvasInstance.width, harness.canvasInstance.height], [0, 0]);
});

test('clears pixel memory and releases resources when PNG encoding fails', async () => {
  const harness = makeRuntime({ encodeError: new Error('encode failed') });

  await assert.rejects(
    removeSampledColor(harness.file, green, 48, harness.runtime),
    /encode failed/
  );

  assert.equal(harness.bitmapClosed, true);
  assert.deepEqual([harness.canvasInstance.width, harness.canvasInstance.height], [0, 0]);
  assert.ok(harness.frameData.every((channel) => channel === 0));
});

test('releases the bitmap and canvas when image-frame dimensions are invalid', async () => {
  const harness = makeRuntime({ pixels: [0, 255, 0, 255], width: 2, height: 1 });

  await assert.rejects(
    removeSampledColor(harness.file, green, 48, harness.runtime),
    /invalid image frame/
  );

  assert.equal(harness.bitmapClosed, true);
  assert.deepEqual([harness.canvasInstance.width, harness.canvasInstance.height], [0, 0]);
  assert.ok(harness.frameData.every((channel) => channel === 0));
});
