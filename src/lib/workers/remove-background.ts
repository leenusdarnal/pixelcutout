import { env, pipeline } from '@huggingface/transformers';
env.allowLocalModels = false;
env.useBrowserCache = true;
let remover: any;
self.onmessage = async (event: MessageEvent) => {
 if (event.data?.type !== 'process') return;
 try {
  if (!remover) remover = await pipeline('background-removal', 'onnx-community/BiRefNet_lite-ONNX', { device: 'webgpu' }).catch(() => pipeline('background-removal', 'onnx-community/BiRefNet_lite-ONNX', { device: 'wasm' }));
  const output = await remover(event.data.file);
  const blob = output instanceof Blob ? output : output?.[0] instanceof Blob ? output[0] : null;
  if (!blob) throw new Error('The model returned an unsupported output format.');
  self.postMessage({ type: 'result', url: URL.createObjectURL(blob) });
 } catch (error) { self.postMessage({ type: 'error', message: error instanceof Error ? error.message : 'Background removal failed.' }); }
};
