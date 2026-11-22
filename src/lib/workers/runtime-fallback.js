/**
 * Run a WebGPU attempt and fall back to WASM when initialization or inference fails.
 * @template T
 * @param {{ runWebGpu: () => Promise<T>, runWasm: () => Promise<T>, onWebGpuFailure?: (error: unknown) => void | Promise<void> }} options
 * @returns {Promise<T>}
 */
export async function runWithWasmFallback({ runWebGpu, runWasm, onWebGpuFailure }) {
  try {
    return await runWebGpu();
  } catch (error) {
    await onWebGpuFailure?.(error);
    return runWasm();
  }
}
