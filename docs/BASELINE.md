# PixelCutout baseline

Captured: 2026-11-22  
Repository: [leenusdarnal/pixelcutout](https://github.com/leenusdarnal/pixelcutout)  
Baseline branch: `main`  
Build-verified commit: `b6f9cdb8bca5280d1b617b7473b015e941f52f31`

## Toolchain and reproducible commands

The repository uses SvelteKit 2, Svelte 5, TypeScript, Vite, and npm. `package-lock.json` is committed (lockfile version 3).

Run from a clean checkout with Node.js 22:

```sh
npm ci --no-audit --no-fund --onnxruntime-node-install-cuda=skip
npm run dev
npm run test
npm run check
npm run build
```

The CI install flag skips the optional CUDA execution-provider download attempted by the transitive `onnxruntime-node@1.21.0` install script. The browser app uses ONNX Runtime Web; the Node CUDA provider is not the browser WebGPU/WASM execution path. Keep this flag in CI unless the Node CUDA provider becomes a deliberate requirement.

The `build` script runs tests, Svelte/TypeScript checks, then the Vite production build.

## CI baseline and resolution

- Workflow: **Verify PixelCutout**
- Successful run: [45001169884](https://github.com/leenusdarnal/pixelcutout/actions/runs/45001169884) (run #24)
- Verified commit: `b6f9cdb8bca5280d1b617b7473b015e941f52f31`
- Result: **success**
- Dependency install: `npm ci` completed; 109 packages added on the Ubuntu x64 runner.
- Unit tests: **14 passed, 0 failed**.
- Svelte/TypeScript: **0 errors, 0 warnings**.
- Production build: **passed**; static site output written to `build`.

Root cause of the earlier failure: the `onnxruntime-node@1.21.0` install script attempted to download `onnxruntime-linux-x64-gpu-1.21.0.tgz`, and the GitHub release URL returned **404**. The install script's own error output recommended `--onnxruntime-node-install-cuda=skip`. Applying that package-specific npm config to the CI install command fixed dependency installation without changing application dependencies or the browser inference path.

Earlier failing run: [45000210362](https://github.com/leenusdarnal/pixelcutout/actions/runs/45000210362).

## Production bundle baseline

Sizes below are from Vite's production build output on the GitHub Actions Ubuntu x64 runner. Values are emitted asset sizes; gzip figures are reported by Vite. These are build measurements, not a browser network waterfall.

| Asset / role | Raw size | Gzip size | Loading note |
|---|---:|---:|---|
| Main page route chunk (`nodes/2`) | 56.18 kB | 20.09 kB | Route JavaScript |
| Largest shared client chunk | 34.77 kB | 13.28 kB | Shared client code |
| Next shared client chunk | 15.30 kB | 6.14 kB | Shared client code |
| Main CSS asset | 19.60 kB | 3.79 kB | App stylesheet |
| App entry | 5.64 kB | 2.67 kB | Client entry |
| Background-removal worker entry | 3.59 kB | — | Worker is created only when processing starts |
| Worker runtime chunk | 902.08 kB | — | Worker-side dependency bundle |
| ONNX Runtime WASM | 21,596.02 kB | 5,087.10 kB | Worker/runtime asset; not an initial route script |

The page creates the worker from `beginProcessing()`, which is called by a removal action. The worker dynamically imports Transformers.js only when AI removal is requested. The remote MODNet model weights are downloaded separately on first AI use and are not included in the Vite bundle-size figures.

**Performance implication:** the first-load route chunks are much smaller than the worker/runtime assets. The worker bundle and particularly the ONNX WASM asset are the largest emitted assets and should be treated as key optimisation targets. Do not count them as initially downloaded without verifying a browser waterfall.

## Dependency and architecture notes

See [DEPENDENCY_AUDIT.md](DEPENDENCY_AUDIT.md) for the direct dependency inventory, transitive runtime notes, and removal decisions.

## Privacy boundary reviewed

Code review confirms:

- Selected image bytes are posted to a local Web Worker with `postMessage`.
- AI inference is executed in that worker; Transformers.js is dynamically imported only for the AI path.
- The UI distinguishes model asset downloads from image pixels and tells users that their photo is not uploaded.
- The service worker excludes cross-origin requests and non-GET requests from its cache handling; model assets are intentionally not added to the app cache.

This is a static code/documentation review, not a live network-inspection proof. The Phase 2 privacy acceptance check must still verify actual browser network behaviour for both AI and manual modes.

## Measurement limits

- Build sizes are from CI logs. A clean local checkout was not run in this environment.
- No representative-device inference timings, peak-memory figures, or browser transfer waterfall have been captured.
- Model download size and cold-start time remain TBD pending the model benchmark phase.
- Build output provides emitted asset sizes; exact first-load transfer should be confirmed with browser devtools before setting a performance target.
