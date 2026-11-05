import { env, pipeline } from '@huggingface/transformers';

env.allowLocalModels = false;
env.useBrowserCache = true;

let remover: any = null;
let removerDevice: 'webgpu' | 'wasm' | null = null;

async function loadRemover(device: 'webgpu' | 'wasm') {
  remover = await pipeline('background-removal', 'Xenova/modnet', {
    device,
    dtype: 'fp32'
  });
  removerDevice = device;
  return remover;
}

async function runRemoval(file: Blob) {
  if (!remover) {
    try {
      await loadRemover('webgpu');
    } catch {
      await loadRemover('wasm');
    }
  }

  try {
    return await remover(file);
  } catch (error) {
    // WebGPU can be present but still fail for a particular browser/driver.
    if (removerDevice !== 'webgpu') throw error;

    try {
      await remover?.dispose?.();
    } catch {
      // Continue with a fresh WASM session.
    }

    remover = null;
    removerDevice = null;
    await loadRemover('wasm');
    return await remover(file);
  }
}

function toPngBlob(rawImage: any): Promise<Blob> {
  if (!rawImage || !Number.isInteger(rawImage.width) || !Number.isInteger(rawImage.height) || !rawImage.data) {
    throw new Error('The background-removal model returned an unsupported image.');
  }

  const image = rawImage.rgba();
  const canvas = new OffscreenCanvas(image.width, image.height);
  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('This browser cannot create the PNG preview. Try a recent version of Chrome, Edge, or Firefox.');
  }

  const pixels = new ImageData(
    new Uint8ClampedArray(image.data),
    image.width,
    image.height
  );

  context.putImageData(pixels, 0, 0);
  return canvas.convertToBlob({ type: 'image/png' });
}

self.onmessage = async (event: MessageEvent) => {
  if (event.data?.type !== 'process') return;

  try {
    const result = await runRemoval(event.data.file);
    const image = Array.isArray(result) ? result[0] : result;

    if (!image) {
      throw new Error('The model did not return an image. Please try another photo.');
    }

    const blob = await toPngBlob(image);
    self.postMessage({ type: 'result', blob });
  } catch (error) {
    self.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : 'Background removal failed. Please try another image.'
    });
  }
};
