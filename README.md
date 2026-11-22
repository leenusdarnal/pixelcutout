# PixelCutout

PixelCutout is a privacy-first, browser-based background remover. It processes one image at a time, entirely on the user's device. Image pixels are never uploaded to an application server.

## Core workflow

1. Choose one PNG, JPG, or WebP image (up to 20 MB, 16 megapixels, and 10,000 pixels on either side).
2. Click **Remove background** to start AI processing. The AI runtime and model are loaded only after this explicit action.
3. Compare the original and cutout with the before/after slider.
4. Download a full-resolution transparent PNG.

AI removal is the primary method. **Advanced: manual colour removal** is available for simple, fairly uniform backgrounds. It samples a colour from the image and applies an adjustable tolerance locally.

## Privacy

- Source image pixels remain in the browser and are passed to a local Web Worker for processing.
- Image dimensions are read from a small file-header slice before the preview is created; images above the dimension or pixel limit are rejected before full-resolution processing.
- AI mode downloads the model and runtime assets from public model hosts after the user starts removal. These are model files, not image uploads.
- Manual colour removal does not load the AI runtime or download model files.
- PixelCutout does not send image pixels to an application server, model host, analytics service, or cloud storage.
- The service worker caches the compiled app and explicit static PWA assets; it does not cache remote model downloads or user-selected images.

A first-time AI run requires an internet connection to download model assets. The manual colour method works without downloading the AI model.

## AI model and limitations

The AI workflow currently uses [Xenova/modnet](https://huggingface.co/Xenova/modnet), a portrait-matting model published under Apache-2.0. It is designed primarily for people and portraits; results on pets, products, fine objects, glass, and complex scenes may be less reliable.

The browser tries the WebGPU model first and falls back to the WASM model. Browser, driver, and device compatibility vary. The model/runtime benchmark is tracked before any production model replacement.

## Lightweight scope

The initial product intentionally focuses on one-image upload, AI background removal, advanced manual colour removal, before/after comparison, and transparent PNG export.

Batch processing, ZIP export, brush editing, undo/redo, crop tools, background replacement, shadows, multiple export formats, accounts, cloud history, and backend image processing are out of scope.

## Stack

- Svelte 5 + SvelteKit
- TypeScript + Vite
- Transformers.js with ONNX Runtime Web
- Browser Web Worker for image processing
- Static hosting

## Development

Use Node.js 22 and the committed npm lockfile.

```sh
npm ci --no-audit --no-fund --onnxruntime-node-install-cuda=skip
npm run dev
npm run test
npm run check
npm run build
```

The ONNX Runtime Node package has a post-install step that may attempt to download its optional CUDA provider. The install flag skips that optional Node CUDA download; it does not disable the browser's WebGPU or WASM inference paths.

## Project tracking

The implementation plan and acceptance checks are maintained in [docs/PROJECT_TRACKER.md](docs/PROJECT_TRACKER.md). See [docs/BASELINE.md](docs/BASELINE.md) and [docs/DEPENDENCY_AUDIT.md](docs/DEPENDENCY_AUDIT.md) for the measured pre-simplification baseline and dependency inventory.
