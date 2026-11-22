# PixelCutout dependency audit

Captured: 2026-11-22  
Source: `package.json`, `package-lock.json` (lockfile version 3), current source imports, and successful CI build.

## Direct dependencies

| Package | Pinned version | Category | Observed purpose | Decision |
|---|---:|---|---|---|
| `@huggingface/transformers` | 3.8.1 | Runtime | Imported dynamically by `src/lib/workers/remove-background.ts` for AI background removal | Keep; core feature. Benchmark alternatives before replacing it. |
| `@sveltejs/adapter-static` | 3.0.8 | Runtime/build | Emits the static site for deployment | Keep; matches static hosting. |
| `@sveltejs/kit` | 2.20.8 | Runtime/build | App framework, routing, build integration | Keep; no framework migration. |
| `svelte` | 5.25.7 | Runtime | UI component framework | Keep. |
| `@sveltejs/vite-plugin-svelte` | 5.0.3 | Development | Svelte compilation in Vite | Keep; required for current build. |
| `svelte-check` | 4.1.4 | Development | Svelte and TypeScript diagnostics | Keep; part of CI verification. |
| `typescript` | 5.8.2 | Development | TypeScript language/compiler support | Keep; source and worker code use TypeScript. |
| `vite` | 6.2.2 | Development | Dev server and production bundler | Keep; part of SvelteKit toolchain. |

Direct dependency count: **4 runtime + 4 development**. The lockfile contains **181 package entries excluding the project root**; the successful Linux x64 `npm ci` installed 109 packages after platform/optional-package filtering.

## Important transitive packages

| Package | Locked version | Role / observation | Decision |
|---|---:|---|---|
| `onnxruntime-web` | 1.22.0-dev.20250409-89f8206ba4 | Browser ONNX execution runtime used by Transformers.js; contributes a large WASM asset | Keep for now; measure model/runtime alternatives in Phase 3. |
| `onnxruntime-node` | 1.21.0 | Node binding brought in by Transformers.js; install script attempted optional Linux CUDA download and failed with HTTP 404 in CI | Do not add it as a direct dependency. CI skips the optional CUDA download. Revisit only if server-side Node inference becomes a requirement. |
| `sharp` | `^0.34.1` (resolved by lockfile) | Listed as a Transformers.js transitive dependency; not imported by application source | Do not remove by hand from the lockfile. Reassess whether the package's optional/dependency structure can be reduced safely when evaluating the AI runtime. |

## Local modules

The following local modules remain in the focused first-release path:

- Manual colour removal: `src/lib/image/remove-color.js`.
- Image header validation: `src/lib/image/image-dimensions.js` reads PNG/JPEG/WebP dimensions from a bounded header slice and is dynamically imported only after file selection; it adds no package dependency.
- The background-removal worker: `src/lib/workers/remove-background.ts`.
- Manual colour tests: `src/lib/image/remove-color.test.mjs`.

The pre-simplification implementation also contained batch/ZIP modules, alpha-feather editing utilities, and a Studio editor component. These were removed when the app was narrowed to the agreed first-release scope; no separate ZIP, editor, state-management, or UI component package is needed.

The header-validation helper is covered by `src/lib/image/image-dimensions.test.mjs` and enforces a 16-megapixel cap plus a 10,000-pixel maximum side before creating the preview URL.

## Scope and bundle observations

- The main page statically imports no editor or batch-processing component.
- The worker entry is created only when a removal action starts. Transformers.js is dynamically imported only for AI removal.
- The post-simplification Vercel build shows route JavaScript reduced from 56.18 kB to 14.44 kB (-74.3%) and CSS from 19.60 kB to 6.31 kB (-67.8%). The worker runtime (902.08 kB) and ONNX WASM (21,596.02 kB) remain unchanged and are key Phase 3 optimisation targets. Detailed measurements are in `docs/BASELINE.md`.
- Batch processing, ZIP export, brushes, undo/redo, crop, background replacement, shadows, and multi-format export remain outside the initial release.

## Removal decision

No direct dependency was removed in this audit. Each of the eight direct dependencies has a clear role in the current source/build. Removing a package without an alternative would break the toolchain or primary AI workflow. The first reduction was made by removing out-of-scope application code, not by changing the framework or AI runtime.
