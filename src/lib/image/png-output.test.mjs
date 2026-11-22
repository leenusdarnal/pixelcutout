import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeRgbaPng } from './png-output.js';

function createRawImage(width, height, values) {
  return {
    width,
    height,
    rgba() {
      return {
        width,
        height,
        data: new Uint8Array(values)
      };
    }
  };
}

function createTestOptions(state, { failEncoding = false } = {}) {
  return {
    createCanvas(width, height) {
      state.canvas = {
        width,
        height,
        originalWidth: width,
        originalHeight: height,
        getContext(type) {
          assert.equal(type, '2d');
          return {
            putImageData(imageData, x, y) {
              state.drawPosition = [x, y];
              state.dimensions = [imageData.width, imageData.height];
              state.rgba = Array.from(imageData.data);
              state.pixelBuffer = imageData.data;
            }
          };
        },
        async convertToBlob(options) {
          state.mimeType = options.type;
          if (failEncoding) throw new Error('PNG encoding failed');
          return new Blob([Uint8Array.of(1, 2, 3)], { type: options.type });
        }
      };

      return state.canvas;
    },
    createImageData(data, width, height) {
      return { data, width, height };
    }
  };
}

test('exports a full-size RGBA frame and preserves transparent and semi-transparent pixels', async () => {
  const state = {};
  const blob = await encodeRgbaPng(
    createRawImage(3, 1, [
      240, 10, 30, 255,
      10, 20, 30, 0,
      40, 50, 60, 128
    ]),
    createTestOptions(state)
  );

  assert.equal(state.canvas.originalWidth, 3);
  assert.equal(state.canvas.originalHeight, 1);
  assert.deepEqual(state.dimensions, [3, 1]);
  assert.deepEqual(state.drawPosition, [0, 0]);
  assert.deepEqual(state.rgba, [
    240, 10, 30, 255,
    10, 20, 30, 0,
    40, 50, 60, 128
  ]);
  assert.equal(state.mimeType, 'image/png');
  assert.equal(blob.type, 'image/png');
  assert.equal(blob.size, 3);
  assert.equal(state.canvas.width, 0);
  assert.equal(state.canvas.height, 0);
});

test('rejects an incomplete RGBA buffer before allocating a canvas', async () => {
  const state = { canvasCreated: false };
  const options = createTestOptions(state);
  const createCanvas = options.createCanvas;

  options.createCanvas = (...args) => {
    state.canvasCreated = true;
    return createCanvas(...args);
  };

  await assert.rejects(
    encodeRgbaPng(createRawImage(2, 1, [1, 2, 3, 4, 5, 6, 7]), options),
    /incomplete or incorrectly sized image/
  );

  assert.equal(state.canvasCreated, false);
});

test('clears temporary pixel memory and canvas dimensions when PNG encoding fails', async () => {
  const state = {};

  await assert.rejects(
    encodeRgbaPng(
      createRawImage(1, 1, [100, 120, 140, 64]),
      createTestOptions(state, { failEncoding: true })
    ),
    /PNG encoding failed/
  );

  assert.deepEqual(Array.from(state.pixelBuffer), [0, 0, 0, 0]);
  assert.equal(state.canvas.width, 0);
  assert.equal(state.canvas.height, 0);
});
