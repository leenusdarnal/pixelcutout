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
    // WebGPU can be present but still fail for a particular browser or driver.
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

async function removeSampledColor(
  file: Blob,
  color: { r: number; g: number; b: number },
  tolerance: number
): Promise<Blob> {
  const bitmap = await createImageBitmap(file);

  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext('2d', { willReadFrequently: true });

    if (!context) {
      throw new Error('This browser cannot process the image. Try a recent version of Chrome, Edge, or Firefox.');
    }

    context.drawImage(bitmap, 0, 0);
    const image = context.getImageData(0, 0, bitmap.width, bitmap.height);
    const pixels = image.data;
    const limit = Math.max(1, Math.min(180, Number(tolerance) || 48));
    const featherStart = limit * 0.72;
    const featherWidth = Math.max(1, limit - featherStart);

    // Remove similar colours throughout the image. A soft transition helps reduce harsh edges.
    for (let offset = 0; offset < pixels.length; offset += 4) {
      const red = pixels[offset] - color.r;
      const green = pixels[offset + 1] - color.g;
      const blue = pixels[offset + 2] - color.b;
      const distance = Math.sqrt(red * red + green * green + blue * blue);

      let alpha = 255;
      if (distance <= featherStart) {
        alpha = 0;
      } else if (distance < limit) {
        alpha = Math.round(((distance - featherStart) / featherWidth) * 255);
      }

      pixels[offset + 3] = Math.round((pixels[offset + 3] * alpha) / 255);
    }

    context.putImageData(image, 0, 0);
    return await canvas.convertToBlob({ type: 'image/png' });
  } finally {
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
