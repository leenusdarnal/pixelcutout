import { removeColorPixels } from '../image/remove-color.js';
import { encodeRgbaPng } from '../image/png-output.js';
import { runWithWasmFallback } from './runtime-fallback.js';
import { selectInitialDevice } from './device-selection.js';

type TransformersModule = typeof import('@huggingface/transformers');

let transformersModule: TransformersModule | null = null;
let remover: any = null;
let removerDevice: 'webgpu' | 'wasm' | null = null;

async function getTransformers() {
  // Keep the AI runtime out of the no-AI path. It is imported only when AI removal is requested.
  if (!transformersModule) {
    transformersModule = await import('@huggingface/transformers');
    transformersModule.env.allowLocalModels = false;
    transformersModule.env.useBrowserCache = true;
  }

  return transformersModule;
}

function createProgressCallback() {
  return (info: any) => {
    if (info.status === 'download') {
      self.postMessage({
        type: 'download-progress',
        progress: 0,
        file: info.file || 'model asset'
      });
      return;
    }

    if (info.status === 'progress') {
      self.postMessage({
        type: 'download-progress',
        progress: Math.max(0, Math.min(100, Math.round(Number(info.progress) || 0))),
        file: info.file || 'model asset'
      });
      return;
    }

    // Kept for compatibility with Transformers.js releases that report aggregate progress.
    if (info.status === 'progress_total' && Number.isFinite(info.progress)) {
      self.postMessage({
        type: 'download-progress',
        progress: Math.max(0, Math.min(100, Math.round(info.progress))),
        file: 'model files'
      });
      return;
    }

    if (info.status === 'done') {
      self.postMessage({
        type: 'download-progress',
        progress: 100,
        file: info.file || 'model asset'
      });
      return;
    }

    if (info.status === 'ready') {
      self.postMessage({ type: 'status', stage: 'processing' });
    }
  };
}

async function loadRemover(device: 'webgpu' | 'wasm') {
  const { pipeline } = await getTransformers();

  remover = await pipeline('background-removal', 'Xenova/modnet', {
    device,
    // MODNet publishes a compact q4f16 WebGPU model and a uint8 WASM model.
    dtype: device === 'webgpu' ? 'q4f16' : 'uint8',
    progress_callback: createProgressCallback()
  });
  removerDevice = device;
  return remover;
}

async function runRemoval(file: Blob) {
  // Once WASM is selected, keep using that session for later images.
  if (remover && removerDevice === 'wasm') {
    return remover(file);
  }

  // Transformers.js 4.3.2 can poison its shared ONNX session chain if a
  // WebGPU session is attempted when navigator.gpu exists but requestAdapter()
  // returns null. Preflight the adapter and go straight to WASM in that case.
  // This keeps the universal CPU path available without first triggering a
  // failed WebGPU session in the same worker.
  const gpu = (self.navigator as unknown as {
    gpu?: { requestAdapter?: () => Promise<unknown> };
  }).gpu;
  const initialDevice = await selectInitialDevice(gpu);

  if (initialDevice === 'wasm') {
    if (!remover || removerDevice !== 'wasm') {
      await loadRemover('wasm');
    }
    return remover(file);
  }

  return runWithWasmFallback({
    runWebGpu: async () => {
      if (!remover || removerDevice !== 'webgpu') {
        await loadRemover('webgpu');
      }
      return remover(file);
    },
    onWebGpuFailure: async () => {
      try {
        await remover?.dispose?.();
      } catch {
        // If cleanup fails, do not reuse the uncertain session.
      }
      remover = null;
      removerDevice = null;
    },
    runWasm: async () => {
      if (!remover || removerDevice !== 'wasm') {
        await loadRemover('wasm');
      }
      return remover(file);
    }
  });
}

async function toPngBlob(rawImage: any): Promise<Blob> {
  return encodeRgbaPng(rawImage);
}

async function removeSampledColor(
  file: Blob,
  color: { r: number; g: number; b: number },
  tolerance: number
): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  let canvas: OffscreenCanvas | null = null;
  let image: ImageData | null = null;

  try {
    canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext('2d', { willReadFrequently: true });

    if (!context) {
      throw new Error('This browser cannot process the image. Try a recent version of Chrome, Edge, or Firefox.');
    }

    context.drawImage(bitmap, 0, 0);
    image = context.getImageData(0, 0, bitmap.width, bitmap.height);
    removeColorPixels(image.data, color, tolerance);
    context.putImageData(image, 0, 0);
    return await canvas.convertToBlob({ type: 'image/png' });
  } finally {
    // The encoded result is returned as a Blob; clear temporary uncompressed pixel memory.
    image?.data.fill(0);
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
    }
    bitmap.close();
  }
}

self.onmessage = async (event: MessageEvent) => {
  const message = event.data;

  try {
    let blob: Blob;

    if (message?.type === 'process-ai') {
      self.postMessage({ type: 'status', stage: 'loading' });
      const result = await runRemoval(message.file);
      self.postMessage({ type: 'status', stage: 'processing' });
      const image = Array.isArray(result) ? result[0] : result;

      if (!image) {
        throw new Error('The model did not return an image. Please try another photo.');
      }

      blob = await toPngBlob(image);
    } else if (message?.type === 'process-manual') {
      const color = message.color;
      if (
        !color ||
        ![color.r, color.g, color.b].every((value: unknown) => Number.isFinite(value))
      ) {
        throw new Error('Select a background colour in the image first.');
      }

      self.postMessage({ type: 'status', stage: 'processing' });
      blob = await removeSampledColor(message.file, color, message.tolerance);
    } else {
      return;
    }

    self.postMessage({ type: 'result', blob });
  } catch (error) {
    self.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : 'Background removal failed. Please try another image.'
    });
  }
};
