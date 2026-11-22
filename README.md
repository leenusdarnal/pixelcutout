# PixelCutout

PixelCutout is a privacy-first, browser-based background remover. It processes one image at a time, entirely on the user's device. Image pixels are never uploaded to an application server.

## Core workflow

1. Choose one PNG, JPG, or WebP image (up to 20 MB, 16 megapixels, and 10,000 pixels on either side).
2. Click **Remove background** to start AI processing. The AI runtime and model are loaded only after this explicit action.
3. Compare the original and cutout with the before/after slider.
4. Download a full-resolution transparent PNG.

AI removal is the primary method. **Advanced: manual colour removal** is available for simple, fairly uniform backgrounds.

To use it, open **Advanced: manual colour removal**, click the background to sample a colour, then adjust the tolerance. Pointer/touch activation samples the selected point; keyboard activation samples the image centre. PixelCutout shows a debounced, reduced-size preview (maximum 512 pixels on the longest side) before you apply it. Click **Remove selected colour** to process the original image at full resolution. The original and AI result are kept separately; switching between AI and manual mode does not overwrite either result. **Choose again** clears the current manual edit so you can sample another colour. A manual preview cannot be downloaded as though it were a full-resolution result; download is enabled only after the current colour and tolerance have been applied.

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

The browser tries the WebGPU model first and falls back to the WASM model. Browser, driver, and device compatibility vary. The model/runtime benchmark is tracked before any production model replacement. The exact model source, observed upstream revision, licence, and update procedure are documented in [docs/MODEL_PROVENANCE.md](docs/MODEL_PROVENANCE.md). If both runtimes fail, the app shows a recoverable error so you can retry or use manual colour removal.

## Lightweight scope

The initial product intentionally focuses on one-image upload, AI background removal, advanced manual colour removal, before/after comparison, and transparent PNG export.

Batch processing, ZIP export, brush editing, undo/redo, crop tools, background replacement, shadows, multiple export formats, accounts, cloud history, and backend image processing are out of scope.

## Stack

- Svelte 5.57.3 + SvelteKit 3.4.0
- TypeScript 6.0.3 + Vite 8.3.8
- Static output through adapter-static 4.0.1
- Transformers.js with ONNX Runtime Web
- Browser Web Worker for image processing
- Static hosting

## Development

Use Node.js 22.17.0 or later and the committed npm lockfile (validated with Node 22.23.5 and npm 10.9.9).

```sh
npm ci --no-audit --no-fund --onnxruntime-node-install-cuda=skip
npm run dev
npm run test
npm run check
npm run benchmark:validate
npm run build
```

The ONNX Runtime Node package has a post-install step that may attempt to download its optional CUDA provider. The install flag skips that optional Node CUDA download; it does not disable the browser's WebGPU or WASM inference paths.

## Project tracking

The implementation plan and acceptance checks are maintained in [docs/PROJECT_TRACKER.md](docs/PROJECT_TRACKER.md). The SvelteKit 3 migration implementation and verification record are maintained in [docs/SVELTEKIT_MIGRATION_PLAN.md](docs/SVELTEKIT_MIGRATION_PLAN.md); the migration was merged in PR [#26](https://github.com/leenusdarnal/pixelcutout/pull/26). CI and the Vercel preview build passed; protected-preview browser/device verification remains open. See [docs/BASELINE.md](docs/BASELINE.md) and [docs/DEPENDENCY_AUDIT.md](docs/DEPENDENCY_AUDIT.md) for the measured pre-simplification baseline and dependency inventory.
