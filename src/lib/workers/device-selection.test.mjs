import test from 'node:test';
import assert from 'node:assert/strict';
import { selectInitialDevice } from './device-selection.js';

test('selects WASM when WebGPU is not exposed', async () => {
  assert.equal(await selectInitialDevice(undefined), 'wasm');
  assert.equal(await selectInitialDevice(null), 'wasm');
  assert.equal(await selectInitialDevice({}), 'wasm');
});

test('selects WASM when WebGPU exposes no usable adapter', async () => {
  const calls = { count: 0 };
  const device = await selectInitialDevice({
    requestAdapter: async () => {
      calls.count += 1;
      return null;
    }
  });

  assert.equal(device, 'wasm');
  assert.equal(calls.count, 1);
});

test('selects WASM when adapter discovery throws', async () => {
  const device = await selectInitialDevice({
    requestAdapter: async () => {
      throw new Error('WebGPU is blocked in this browser');
    }
  });

  assert.equal(device, 'wasm');
});

test('selects WebGPU when the browser returns an adapter', async () => {
  const adapter = { name: 'test-adapter' };
  const device = await selectInitialDevice({
    requestAdapter: async () => adapter
  });

  assert.equal(device, 'webgpu');
});
