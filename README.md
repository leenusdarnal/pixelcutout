# PixelCutout

PixelCutout is a privacy-first, browser-based background remover. Image pixels are processed locally in the visitor's browser and are never uploaded to an application server.

## Stack

- Svelte 5 + SvelteKit
- Transformers.js 3.8.1 and ONNX Runtime Web
- Web Worker inference
- Static hosting on Vercel

## Model

The current browser model is [Xenova/modnet](https://huggingface.co/Xenova/modnet), an Apache-2.0 licensed MODNet portrait-matting model. It is comparatively small and has a documented Transformers.js background-removal pipeline. It is designed primarily for people and portraits; results on products, pets, and other non-human subjects may be less reliable.

The model is downloaded from its public model host the first time it is needed and cached by the browser where supported. WebGPU is attempted first, with a WebAssembly fallback. Browser and device compatibility still vary.

## Development

```bash
npm install
npm run dev
npm run check
npm run build
```

## Privacy

Image files are decoded and processed on-device. The app downloads model weights and runtime assets from public model hosts, but does not send user image pixels to those hosts or to an application server. First-time model use requires an internet connection.
