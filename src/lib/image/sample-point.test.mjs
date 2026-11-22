import test from 'node:test';
import assert from 'node:assert/strict';
import { getBackgroundSamplePoint } from './sample-point.js';

const bounds = { left: 100, top: 50, width: 200, height: 100 };

test('maps pointer coordinates to the corresponding source pixel', () => {
  const point = getBackgroundSamplePoint({
    imageWidth: 1000,
    imageHeight: 500,
    bounds,
    clientX: 150,
    clientY: 75
  });

  assert.deepEqual(point, { x: 250, y: 125 });
});

test('clamps pointer positions to the visible source image edges', () => {
  const point = getBackgroundSamplePoint({
    imageWidth: 100,
    imageHeight: 50,
    bounds,
    clientX: 500,
    clientY: -100
  });

  assert.deepEqual(point, { x: 99, y: 0 });
});

test('keyboard activation samples the image centre without pointer coordinates', () => {
  const point = getBackgroundSamplePoint({
    imageWidth: 640,
    imageHeight: 481,
    bounds,
    clientX: 0,
    clientY: 0,
    keyboardActivation: true
  });

  assert.deepEqual(point, { x: 320, y: 240 });
});

test('rejects invalid image dimensions or displayed bounds', () => {
  assert.throws(() => getBackgroundSamplePoint({
    imageWidth: 0,
    imageHeight: 50,
    bounds,
    clientX: 100,
    clientY: 50
  }), /not ready/);

  assert.throws(() => getBackgroundSamplePoint({
    imageWidth: 100,
    imageHeight: 50,
    bounds: { ...bounds, width: 0 },
    clientX: 100,
    clientY: 50
  }), /not ready/);
});
