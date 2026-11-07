import test from 'node:test';
import assert from 'node:assert/strict';
import { featherAlpha } from './feather-alpha.js';

function imageData(width, height, alpha = 255) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = 40;
    data[i * 4 + 1] = 90;
    data[i * 4 + 2] = 160;
    data[i * 4 + 3] = typeof alpha === 'function' ? alpha(i % width, Math.floor(i / width)) : alpha;
  }
  return { width, height, data };
}

test('feathers opaque pixels along a transparent boundary without expanding it', () => {
  const image = imageData(7, 7, (x, y) => x >= 2 && x <= 4 && y >= 2 && y <= 4 ? 255 : 0);
  const result = featherAlpha(image, 1);
  assert.ok(result.changedPixels > 0);
  assert.ok(image.data[(3 * 7 + 2) * 4 + 3] < 255);
  assert.equal(image.data[(3 * 7 + 1) * 4 + 3], 0);
  assert.equal(image.data[(3 * 7 + 3) * 4 + 3], 255);
});

test('keeps RGB channels unchanged and returns changed tile indexes', () => {
  const image = imageData(8, 8, (x, y) => x >= 2 && y >= 2 ? 255 : 0);
  const before = image.data.slice();
  const result = featherAlpha(image, 1, 4);
  assert.deepEqual([image.data[0], image.data[1], image.data[2]], [before[0], before[1], before[2]]);
  assert.ok(result.changedTiles.length > 0);
  assert.ok(result.changedTiles.every((tile) => Number.isInteger(tile) && tile >= 0));
});

test('zero passes leaves the image unchanged', () => {
  const image = imageData(5, 5, (x, y) => x > 1 && y > 1 ? 255 : 0);
  const before = image.data.slice();
  assert.deepEqual(featherAlpha(image, 0), { changedPixels: 0, changedTiles: [] });
  assert.deepEqual(image.data, before);
});

test('rejects invalid dimensions and tile sizes', () => {
  assert.throws(() => featherAlpha({ width: 2, height: 2, data: new Uint8ClampedArray(3) }), /dimensions/);
  assert.throws(() => featherAlpha(imageData(3, 3), 1, 0), /tileSize/);
});
