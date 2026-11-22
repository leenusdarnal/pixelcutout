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


## Post Phase 1 focused-flow measurement

Measured from Vercel's successful production build for commit `b1916db82ec7e46b7aa3a424f0f335053dfd10c7` on 2026-11-22. The follow-up build also reported `svelte-check found 0 errors and 0 warnings`.

| Asset / role | Before simplification | Focused flow | Change |
|---|---:|---:|---:|
| Page route JavaScript | 56.18 kB (20.09 kB gzip) | 14.44 kB (5.80 kB gzip) | -41.74 kB raw (-74.3%) |
| Page CSS | 19.60 kB (3.79 kB gzip) | 6.31 kB (1.73 kB gzip) | -13.29 kB raw (-67.8%) |
| Worker entry | 3.59 kB | 3.59 kB | No material change |
| Worker runtime chunk | 902.08 kB | 902.08 kB | No material change |
| ONNX Runtime WASM | 21,596.02 kB | 21,596.02 kB | No material change |

The app route and styling are substantially smaller after removing the Studio and batch-processing paths. The inference runtime assets remain large and are the next optimisation target; the worker is created only after a removal action, and the model itself remains a separate remote download. These emitted sizes do not establish exactly what is transferred during the initial browser navigation; confirm that through a network waterfall in Phase 2/6 browser QA.

The latest cleaned build is deployed at [the production preview URL](https://pixelcutout-bv4zr4tzs-leenusdarnals-projects.vercel.app/) and returned HTTP 200. GitHub Actions run [#37](https://github.com/leenusdarnal/pixelcutout/actions/runs/45001772254) had not yet produced a job result at the time this note was written; Vercel's deployment build completed successfully.


## Post P2-01 validation build

Measured from the production build for commit `80fda84fdbe6313a7e26329b88ad33e3b22ee108` on 2026-11-22. GitHub Actions [run #39](https://github.com/leenusdarnal/pixelcutout/actions/runs/45002128282) passed: dependency installation, **15 unit tests**, Svelte/TypeScript (**0 errors, 0 warnings**), and the production build. The Vercel deployment for this commit returned HTTP 200.

| Asset / role | Raw size | Gzip size | Loading note |
|---|---:|---:|---|
| Main page route JavaScript | 14.92 kB | 5.97 kB | Initial route |
| Main CSS asset | 6.31 kB | 1.73 kB | Initial route |
| Small async JS chunks | 2.56 kB + 2.03 kB | 1.21 kB + 1.16 kB | Header validator is dynamically imported only after a user selects a file |
| Worker runtime chunk | 902.08 kB | — | Emitted worker asset |
| ONNX Runtime WASM | 21,596.02 kB | 5,087.10 kB | Emitted worker asset; not in initial HTML modulepreload list |

Compared with the pre-simplification route (56.18 kB raw / 20.09 kB gzip), the current route is 41.26 kB smaller raw (about **73.4% reduction**). CSS is 13.29 kB smaller raw (about **67.8% reduction**). The small file-header parser is dynamically imported only when a file is selected, preserving initial-route size.

P2-01 accepts PNG, JPEG, and WebP up to 20 MB, 16 megapixels, and 10,000 pixels on either side. Its parser reads at most 2 MB from the beginning of the file to identify dimensions; it does not decode or allocate a full-resolution bitmap to perform the validation. The limits should be revisited only with representative memory tests on mobile devices.


## Post lockfile repair and dependency security update

Verified in GitHub Actions run [#100](https://github.com/leenusdarnal/pixelcutout/actions/runs/45015135360) for the dependency-repair branch on 2026-11-22.

- Root cause of the broken CI was a truncated/corrupt tracked `package-lock.json` (approximately 1.5 kB, ending mid-entry and containing invalid UTF-8), not an npm configuration setting.
- Regenerated npm lockfile v3: **176 package entries including the root**, **86,357 bytes**.
- Clean CI install: **104 packages added** on the Ubuntu x64 runner.
- Project tests: **34 passed, 0 failed**.
- Svelte/TypeScript: **0 errors, 0 warnings**.
- Vite production build: **passed** using Vite 6.4.6 and SvelteKit 2.70.4.
- The audit changed from 4 findings (1 low, 1 moderate, 2 high) before the targeted updates to 2 findings (1 low, 1 high; no moderate or critical) after the `cookie@0.7.2` override and targeted framework/dev-tool upgrades.
- Run #100 regenerated the lockfile, installed it, ran the audit, and built the application. After the complete generated lockfile was committed and temporary regeneration/export steps were removed, clean-checkout run [#108](https://github.com/leenusdarnal/pixelcutout/actions/runs/45015590490) passed the manifest check, normal `npm ci` against the committed file, audit report, 34 unit tests, Svelte/TypeScript check (0 errors, 0 warnings), and production build. The Vercel status check for the PR head also passed.

See `docs/DEPENDENCY_AUDIT.md` for package versions and the two conditional remaining findings. This dependency repair does not replace the pending mobile memory, live network privacy, representative-image output, or real-device QA checks in `docs/PROJECT_TRACKER.md`.
