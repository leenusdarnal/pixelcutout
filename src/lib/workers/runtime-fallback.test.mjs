import test from 'node:test';
import assert from 'node:assert/strict';
import { runWithWasmFallback } from './runtime-fallback.js';

test('returns the WebGPU result when it succeeds', async () => {
  const result = await runWithWasmFallback({
    runWebGpu: async () => 'webgpu-result',
    runWasm: async () => 'wasm-result'
  });

  assert.equal(result, 'webgpu-result');
});

test('falls back to WASM when WebGPU initialization fails', async () => {
  const result = await runWithWasmFallback({
    runWebGpu: async () => { throw new Error('WebGPU unavailable'); },
    runWasm: async () => 'wasm-result'
  });

  assert.equal(result, 'wasm-result');
});

test('falls back to WASM when WebGPU inference fails and disposes its session first', async () => {
  const events = [];
  const result = await runWithWasmFallback({
    runWebGpu: async () => { throw new Error('WebGPU device lost'); },
    onWebGpuFailure: async () => { events.push('dispose'); },
    runWasm: async () => { events.push('wasm'); return 'wasm-result'; }
  });

  assert.equal(result, 'wasm-result');
  assert.deepEqual(events, ['dispose', 'wasm']);
});

test('propagates a WASM failure rather than hiding it', async () => {
  await assert.rejects(
    runWithWasmFallback({
      runWebGpu: async () => { throw new Error('WebGPU unavailable'); },
      runWasm: async () => { throw new Error('WASM failed'); }
    }),
    /WASM failed/
  );
});

test('propagates cleanup failure rather than starting WASM with an unknown session state', async () => {
  const wasmStarted = { value: false };

  await assert.rejects(
    runWithWasmFallback({
      runWebGpu: async () => { throw new Error('WebGPU failed'); },
      onWebGpuFailure: async () => { throw new Error('dispose failed'); },
      runWasm: async () => { wasmStarted.value = true; return 'unexpected'; }
    }),
    /dispose failed/
  );

  assert.equal(wasmStarted.value, false);
});
