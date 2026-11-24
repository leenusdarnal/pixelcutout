import { AutoModel, AutoProcessor, RawImage, env } from '@huggingface/transformers';

const MODELS = {
  modnet: {
    id: 'Xenova/modnet',
    observedRevision: 'fa2fa546052fba4c08921230a26cc69a333fca12',
    observedRevisionDate: '2026-11-22',
    dtype: { webgpu: 'q4f16', wasm: 'uint8' },
    inputName: 'input',
    outputName: 'output',
    applySigmoid: false
  },
  birefnet: {
    id: 'studioludens/birefnet-lite-512',
    observedRevision: '962e67969ec6acec9c19fab76acee4f5e22e990c',
    observedRevisionDate: '2026-11-22',
    dtype: { webgpu: 'fp16', wasm: 'fp32' },
    inputName: 'input_image',
    outputName: 'logits',
    applySigmoid: true
  }
};

let model = null;
let processor = null;
let activeConfig = null;
let loadedDevice = null;
let reportedAssetBytes = null;

function progressCallback(info) {
  if (info && typeof info === 'object') {
    if (info.status === 'progress_total' && Number.isFinite(info.total)) {
      reportedAssetBytes = Number(info.total);
      self.postMessage({
        type: 'download-progress',
        loadedBytes: Number(info.loaded) || 0,
        totalBytes: Number(info.total) || 0,
        progress: Number(info.progress) || 0
      });
    } else if (info.status === 'progress' && Number.isFinite(info.total)) {
      reportedAssetBytes = Math.max(reportedAssetBytes || 0, Number(info.total));
      self.postMessage({
        type: 'download-progress',
        loadedBytes: Number(info.loaded) || 0,
        totalBytes: reportedAssetBytes,
        progress: Number(info.progress) || 0
      });
    } else if (info.status === 'download') {
      self.postMessage({ type: 'status', message: `Downloading ${info.file || 'model assets'}` });
    } else if (info.status === 'done') {
      self.postMessage({ type: 'status', message: `Loaded ${info.file || 'model asset'}` });
    }
  }
}

async function loadCandidate(candidate, device) {
  if (!MODELS[candidate]) throw new Error('Unknown benchmark model.');
  if (!['webgpu', 'wasm'].includes(device)) throw new Error('Unknown inference backend.');
  const config = MODELS[candidate];
  const dtype = config.dtype[device];
  env.allowLocalModels = false;
  env.useBrowserCache = true;
  model = null;
  processor = null;
  activeConfig = config;
  loadedDevice = device;
  reportedAssetBytes = null;

  const started = performance.now();
  model = await AutoModel.from_pretrained(config.id, {
    device,
    dtype,
    progress_callback: progressCallback
  });
  processor = await AutoProcessor.from_pretrained(config.id, {
    progress_callback: progressCallback
  });

  self.postMessage({
    type: 'ready',
    modelId: config.id,
    modelRevision: `${config.observedRevision} (observed ${config.observedRevisionDate}; runtime uses unpinned main)`,
    modelRevisionPinned: false,
    dtype,
    modelLoadMs: performance.now() - started,
    reportedAssetBytes
  });
}

function getOutputTensor(outputs, name) {
  const value = outputs?.[name];
  if (!value || typeof value !== 'object') {
    throw new Error(`Model did not return the expected '${name}' tensor.`);
  }
  const tensor = value[0];
  if (!tensor || !tensor.dims || !tensor.data) {
    throw new Error(`Model output '${name}' did not contain a readable alpha tensor.`);
  }
  return tensor;
}

async function inferImage(blob) {
  if (!model || !processor || !activeConfig || !loadedDevice) {
    throw new Error('Load a model before running inference.');
  }

  const raw = await RawImage.read(blob);
  const image = raw.rgb();
  const preprocessingStart = performance.now();
  const processed = await processor(image);
  const preprocessMs = performance.now() - preprocessingStart;
  const pixelValues = processed.pixel_values;
  if (!pixelValues) throw new Error('Model processor did not return pixel_values.');

  const inferenceStart = performance.now();
  const outputs = await model({ [activeConfig.inputName]: pixelValues });
  const inferenceMs = performance.now() - inferenceStart;
  const postprocessStart = performance.now();

  const outputTensor = getOutputTensor(outputs, activeConfig.outputName);
  const dims = outputTensor.dims;
  if (dims.length !== 3 || dims[0] !== 1) {
    throw new Error(`Unexpected alpha tensor shape: [${dims.join(', ')}]. Expected [1, height, width].`);
  }

  const maskHeight = dims[1];
  const maskWidth = dims[2];
  const values = outputTensor.data;
  if (values.length !== maskWidth * maskHeight) {
    throw new Error('Alpha tensor dimensions do not match its pixel buffer.');
  }

  const alpha = new Uint8ClampedArray(values.length);
  for (let index = 0; index < values.length; index += 1) {
    const rawValue = Number(values[index]);
    const value = activeConfig.applySigmoid
      ? 1 / (1 + Math.exp(-rawValue))
      : rawValue;
    alpha[index] = Math.round(Math.min(1, Math.max(0, value)) * 255);
  }

  let mask = new RawImage(alpha, maskWidth, maskHeight, 1);
  mask = await mask.resize(raw.width, raw.height, { resample: 2 });
  if (mask.channels !== 1 || mask.width !== raw.width || mask.height !== raw.height) {
    throw new Error('Resized alpha matte does not match the source dimensions.');
  }

  // Encode alpha in the PNG alpha channel; the local Python scorer reads this channel.
  const rgba = new Uint8ClampedArray(raw.width * raw.height * 4);
  for (let index = 0, pixel = 0; index < mask.data.length; index += 1, pixel += 4) {
    rgba[pixel] = 255;
    rgba[pixel + 1] = 255;
    rgba[pixel + 2] = 255;
    rgba[pixel + 3] = mask.data[index];
  }
  const output = new RawImage(rgba, raw.width, raw.height, 4);
  const alphaPng = await output.toBlob('image/png');
  const postprocessMs = performance.now() - postprocessStart;

  return {
    alphaPng,
    width: raw.width,
    height: raw.height,
    preprocessMs,
    inferenceMs,
    postprocessMs,
    totalMs: preprocessMs + inferenceMs + postprocessMs
  };
}

self.onmessage = async (event) => {
  const message = event.data;
  try {
    if (message?.type === 'load') {
      self.postMessage({ type: 'status', message: 'Loading model and image processor' });
      await loadCandidate(message.candidate, message.device);
      return;
    }
    if (message?.type === 'warmup') {
      const result = await inferImage(message.image);
      self.postMessage({ type: 'warmup-result', totalMs: result.totalMs, inferenceMs: result.inferenceMs });
      return;
    }
    if (message?.type === 'run-case') {
      if (typeof message.caseId !== 'string') throw new Error('Case ID is missing.');
      const result = await inferImage(message.image);
      self.postMessage({ type: 'case-result', caseId: message.caseId, ...result });
      return;
    }
    if (message?.type === 'dispose') {
      try { await model?.dispose?.(); } catch { /* Worker will be terminated by the caller. */ }
      model = null;
      processor = null;
      activeConfig = null;
    }
  } catch (error) {
    self.postMessage({
      type: 'failure',
      message: error instanceof Error ? error.message : 'The benchmark model failed.'
    });
  }
};
