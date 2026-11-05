# PixelCutout

PixelCutout is a privacy-first, browser-based background remover. Image pixels are processed locally in the visitor's browser and are never uploaded to an application server.

## Removal methods

PixelCutout gives users two choices:

- **AI automatic:** Uses [Xenova/modnet](https://huggingface.co/Xenova/modnet) to identify and remove the subject background. The model is downloaded only when the user starts AI removal, and the interface displays download progress as a percentage. Transformers.js selects browser-optimised weights by default where available. The model is cached by the browser where supported.
- **Without AI:** Lets the user click a background colour in the image, adjust the colour tolerance, and remove matching colours. It does not download an AI model. This works best for plain or fairly uniform backgrounds; matching colours inside the subject may also become transparent.

## Stack

- Svelte 5 + SvelteKit
- Transformers.js 3.8.1 and ONNX Runtime Web
- Web Worker inference and local image processing
- Static hosting on Vercel

## AI model

The AI option uses the Apache-2.0 licensed [Xenova/modnet](https://huggingface.co/Xenova/modnet), a portrait-matting model. It is designed primarily for people and portraits; results on products, pets, and other non-human subjects may be less reliable.

WebGPU is attempted first, with a WebAssembly fallback. Browser and device compatibility still vary.

## Development

\`\`\`bash
npm install
npm run dev
npm run check
npm run build
\`\`\`

## Privacy

Image files are decoded and processed on-device. AI mode downloads model and runtime assets from public model hosts, but does not send user image pixels to those hosts or to an application server. No-AI mode uses local colour matching and does not download model files. First-time AI model use requires an internet connection.
