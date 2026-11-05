import test from 'node:test';
import assert from 'node:assert/strict';
import { removeColorPixels } from './remove-color.js';

const green = { r: 0, g: 255, b: 0 };

test('removes exact matches to the sampled background colour', () => {
  const pixels = new Uint8ClampedArray([0, 255, 0, 255]);
  const result = removeColorPixels(pixels, green, 48);
  assert.equal(result, pixels);
  assert.equal(pixels[3], 0);
});

test('keeps foreground colours outside the tolerance unchanged', () => {
  const pixels = new Uint8ClampedArray([255, 0, 0, 255]);
  removeColorPixels(pixels, green, 48);
  assert.deepEqual([...pixels], [255, 0, 0, 255]);
});

test('feathers pixels close to the tolerance boundary', () => {
  // Difference of 40 is between the 36px feather start and 50px limit.
  const pixels = new Uint8ClampedArray([40, 255, 0, 255]);
  removeColorPixels(pixels, green, 50);
  assert.ok(pixels[3] > 0 && pixels[3] < 255, `expected partial alpha, received ${pixels[3]}`);
});

test('preserves original alpha for foreground pixels', () => {
  const pixels = new Uint8ClampedArray([255, 0, 0, 128]);
  removeColorPixels(pixels, green, 48);
  assert.equal(pixels[3], 128);
});

test('does not modify already transparent pixels', () => {
  const pixels = new Uint8ClampedArray([0, 255, 0, 0]);
  removeColorPixels(pixels, green, 48);
  assert.deepEqual([...pixels], [0, 255, 0, 0]);
});

test('clamps tolerance to the supported range', () => {
  const exact = new Uint8ClampedArray([0, 255, 0, 255]);
  removeColorPixels(exact, green, 0);
  assert.equal(exact[3], 0);

  const distant = new Uint8ClampedArray([0, 0, 0, 255]);
  removeColorPixels(distant, green, 500);
  assert.equal(distant[3], 255);
});

test('rejects invalid pixel buffers and colours', () => {
  assert.throws(() => removeColorPixels(new Uint8ClampedArray([1, 2, 3]), green), /RGBA/);
  assert.throws(() => removeColorPixels(new Uint8ClampedArray([1, 2, 3, 4]), { r: 256, g: 0, b: 0 }), /RGB/);
});
