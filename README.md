# PixelCutout

Privacy-first, browser-based background removal. Images are processed locally in your browser; image pixels are never uploaded to an application server.

## Stack
- Svelte 5 + SvelteKit
- Transformers.js and ONNX Runtime Web
- Web Worker inference
- Static hosting on Vercel

## Development

```bash
npm install
npm run dev
npm run check
npm run build
```

The AI model is downloaded from its public model host on first use and cached by the browser where supported. First-time model download requires internet access. The app shell is statically hosted.

## Privacy
Image files are decoded and processed on-device. The model weights are fetched from the configured public model repository; user image pixels are not sent to that host.
