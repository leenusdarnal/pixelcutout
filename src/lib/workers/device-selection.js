/**
 * Select a safe first inference backend without attempting a WebGPU session
 * when the browser advertises WebGPU but cannot provide an adapter.
 *
 * Transformers.js 4.3.2 has an upstream ONNX web-chain bug: a rejected
 * WebGPU session can poison the shared chain and prevent the subsequent
 * WASM fallback from starting. Checking adapter availability first avoids
 * entering that failure path on adapter-less browsers.
 *
 * @param {{ requestAdapter?: () => Promise<unknown> } | undefined | null} gpu
 * @returns {Promise<'webgpu' | 'wasm'>}
 */
export async function selectInitialDevice(gpu) {
  if (!gpu || typeof gpu.requestAdapter !== 'function') {
    return 'wasm';
  }

  try {
    const adapter = await gpu.requestAdapter();
    return adapter ? 'webgpu' : 'wasm';
  } catch {
    return 'wasm';
  }
}
