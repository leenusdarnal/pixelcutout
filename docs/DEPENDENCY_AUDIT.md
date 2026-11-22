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

## Local modules that do not add package dependencies

- Manual colour removal: `src/lib/image/remove-color.js`.
- Alpha feathering: `src/lib/image/feather-alpha.js`.
- ZIP writing utility: `src/lib/image/zip-store.js` (currently used by the existing batch flow).
- No separate ZIP, editor, state-management, or UI component package is listed as a direct dependency.

## Scope and bundle observations

- The main page statically imports both `StudioEditor.svelte` and `BatchProcessor.svelte`. Those features are currently in the route even though batch processing and broad Studio editing are deferred from the agreed first-release scope.
- The worker entry is created only when a removal action starts. Transformers.js is dynamically imported only for AI removal.
- The largest emitted assets are the worker runtime chunk (902.08 kB) and ONNX Runtime WASM (21,596.02 kB). These are priority investigation targets, but model quality, runtime compatibility, and privacy must remain acceptable.

## Removal decision

No direct dependency has been removed in this audit. Each of the eight direct dependencies has a clear role in the current source/build. Removing a package without an alternative would break the existing toolchain or the primary AI workflow. The best immediate reduction is scope/code-level: remove deferred Batch/Studio paths from the initial release and benchmark the AI runtime/model before replacing a dependency.
