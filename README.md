# PixelCutout

PixelCutout is a privacy-first, browser-based background remover. Image pixels are processed locally in the visitor's browser and are never uploaded to an application server.

## Removal methods

PixelCutout gives users two choices:

- **AI automatic:** Uses [Xenova/modnet](https://huggingface.co/Xenova/modnet) to identify and remove the subject background. The AI runtime is imported only when the user starts AI removal. The browser uses the compact `q4f16` WebGPU model where supported and falls back to the `uint8` WASM model. The interface displays the current model-file download progress as a percentage. The model is cached by the browser where supported.
- **Without AI:** Lets the user click a background colour in the image, adjust the colour tolerance, and remove matching colours. It does not download an AI model. This works best for plain or fairly uniform backgrounds; matching colours inside the subject may also become transparent.

## Studio editor

After removal, the local Studio editor provides:

- **Erase and restore brushes** with adjustable size. Restore uses the original AI cutout as its source.
- **Undo and redo** using small changed-image tiles, with a bounded 24-stroke history.
- **Background previews and replacement:** transparent checkerboard, white, soft neutral, dark, gradient, or a locally selected photo. A custom solid colour is also available.
- **Soft shadow** control for product-style exports.
- **Crop presets:** original, square (1:1), portrait (4:5), story (9:16), and landscape (16:9), plus an automatic crop around visible pixels.
- **Export:** transparent PNG, JPEG, or WebP, and copy the selected image format to the clipboard when supported.

Brush edits, cropping, background composition, and export are handled locally in the browser. Choosing JPEG or WebP with a transparent background uses white so that the file has a valid opaque background.

## Stack

- Svelte 5 + SvelteKit
- Transformers.js 3.8.1 and ONNX Runtime Web
- Web Worker inference and local image processing
- Static hosting on Vercel

## AI model

The AI option uses the Apache-2.0 licensed [Xenova/modnet](https://huggingface.co/Xenova/modnet), a portrait-matting model. It is designed primarily for people and portraits; results on products, pets, and other non-human subjects may be less reliable.

WebGPU is attempted first, with a WebAssembly fallback. Browser and device compatibility still vary.

## Current limitations

- MODNet is primarily a portrait matting model. It can be less reliable for pets, products, fine objects, glass, and complex scenes.
- Crop presets use a centered crop; they do not yet provide a draggable crop frame.
- Batch queues, ZIP export, advanced hair decontamination, and installable offline PWA support are not included in this release.

## Development

\`\`\`bash
npm install
npm run dev
npm run check
npm run build
\`\`\`

## Privacy

Image files are decoded and processed on-device. AI mode downloads model and runtime assets from public model hosts, but does not send user image pixels to those hosts or to an application server. No-AI mode uses local colour matching and does not load the AI runtime or download model files. First-time AI model use requires an internet connection.
