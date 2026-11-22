# PixelCutout dependency audit

Captured: 2026-11-22  
Verified against the repaired lockfile in GitHub Actions run [#100](https://github.com/leenusdarnal/pixelcutout/actions/runs/45015135360).  
Toolchain: Node.js 22.23.5, npm 10.9.9, npm lockfile version 3.

## Direct dependencies

| Package | Pinned version | Category | Observed purpose | Decision |
|---|---:|---|---|---|
| `@huggingface/transformers` | 4.3.2 | Runtime | Imported dynamically by `src/lib/workers/remove-background.ts` for AI background removal | Keep; core feature. Benchmark alternatives before replacing it. |
| `@sveltejs/adapter-static` | 3.0.11 | Runtime/build | Emits the static site for deployment | Keep; matches the static-hosting architecture. |
| `@sveltejs/kit` | 2.70.4 | Runtime/build | App framework, routing, build integration | Keep the 2.x line for this focused static app; review the conditional residual advisories below before enabling affected server features. |
| `svelte` | 5.57.3 | Runtime | UI component framework | Keep. |
| `@sveltejs/vite-plugin-svelte` | 5.0.3 | Development | Svelte compilation in Vite | Keep; required for the current build. |
| `svelte-check` | 4.7.8 | Development | Svelte and TypeScript diagnostics | Keep; part of CI verification. |
| `typescript` | 5.8.2 | Development | TypeScript language/compiler support | Keep; source and worker code use TypeScript. |
| `vite` | 6.4.6 | Development | Dev server and production bundler | Keep; includes the targeted security update and passes the production build. |

Direct dependency count: **4 runtime + 4 development**.

## Lockfile repair

The previously committed `package-lock.json` was not a valid complete lockfile. The Git blob was approximately 1.5 KB and ended partway through the `node_modules/@esbuild/android-arm` entry; its bytes also failed UTF-8 decoding. Consequently, `npm ci` reported that no usable lockfile existed even though the path was present in the checkout.

The lockfile was regenerated from the pinned `package.json` and validated in CI:

- Lockfile version: **3**.
- Package entries: **176**, including the project root (175 dependency entries).
- File size: **86,357 bytes**.
- Linux x64 clean install: **104 packages added**.
- A subsequent normal locked-install CI run is required to prove the committed file works without regeneration; the current validation run regenerated an equivalent lockfile, installed it, and completed the build.

Do not hand-edit the lockfile. When direct dependency versions or overrides change, update it with npm and commit the complete generated file.

## Important transitive packages

| Package | Locked version | Role / observation | Decision |
|---|---:|---|---|
| `onnxruntime-web` | 1.31.0-dev.20260914-8d85527a0 | Browser ONNX execution runtime used by Transformers.js; contributes a large WASM asset | Keep for now; verify model inference and benchmark runtime alternatives before changing it. |
| `onnxruntime-node` | 1.30.0 | Node binding brought in transitively by Transformers.js; its install script may attempt an optional CUDA download | Do not add it as a direct dependency. CI uses `--onnxruntime-node-install-cuda=skip`; the browser app uses ONNX Runtime Web. |
| `sharp` | 0.35.5 | Transitive image-processing package; not imported by application source | Do not remove manually from the lockfile. Reassess only with a measured runtime/dependency alternative. |
| `cookie` | 0.7.2 | Transitive dependency of SvelteKit | Pinned through the root npm override to address the low-severity cookie advisory. Keep the override while SvelteKit 2.x is used. |

The `cookie` override is intentional: SvelteKit 2.70.4 declares `cookie` with a `^0.6.0` range, while the audited lockfile previously resolved 0.6.0. The override to 0.7.2 was installed and passed the full project build.

## Security audit

The initial audit of the regenerated pre-upgrade dependency tree reported **4 findings: 1 low, 1 moderate, and 2 high**. The targeted dependency updates and cookie override reduced this to **2 findings: 1 low and 1 high; 0 moderate and 0 critical** in GitHub Actions run [#100](https://github.com/leenusdarnal/pixelcutout/actions/runs/45015135360).

| Finding reported by npm | Result after targeted updates | Fix reported by npm | Assessment |
|---|---|---|---|
| Vite high-severity advisory | No longer reported after Vite 6.4.6 | 6.4.6 | Targeted fix applied; the project dev command exposes the Vite dev server with `--host 0.0.0.0`, so keeping Vite patched is important. |
| `cookie` low-severity advisory | No longer reported after resolving `cookie` to 0.7.2 | 0.7.0 or later | Addressed with the tested npm override. |
| SvelteKit high-severity advisory, grouped through `@sveltejs/kit` | Still reported | `@sveltejs/kit` 3.4.0 (major upgrade) | Conditional residual risk; see below. |
| Low-severity advisory grouped through `@sveltejs/adapter-static` via SvelteKit | Still reported | `@sveltejs/adapter-static` 4.0.1 (major upgrade) | Review before any adapter major migration; see below. |

### Conditional SvelteKit findings

The high-severity SvelteKit advisory [GHSA-3r8g-jcqq-3p5j](https://github.com/sveltejs/kit/security/advisories/GHSA-3r8g-jcqq-3p5j) affects applications that enable the experimental remote-functions flag and use its `form`, `query`, or `command` remote APIs. The checked-in `svelte.config.js` configures the static adapter and fallback; it does not enable `experimental.remoteFunctions`. Do not enable that experimental feature without first upgrading to a patched SvelteKit release.

The low-severity SvelteKit finding reported through the adapter is also conditional on enhanced form-action routing. The project is a static image-processing app and does not currently use server-side image processing or a server API. This does not erase the npm finding: it remains recorded until a compatible major-version upgrade or a complete advisory-specific mitigation is validated.

npm reports SvelteKit 3.4.0 and adapter-static 4.0.1 as available fixes, both major upgrades. A broad major migration would also affect the framework/build toolchain and is not being mixed into this lightweight dependency repair. Reassess before introducing server endpoints, remote functions, enhanced form actions, or other affected features, and review the framework migration notes as a separate project task.

**Security status:** the dependency count is reduced and the previously corrupt lockfile is repaired, but the project is not represented as having zero npm audit findings. The two remaining findings and the major-version remediation requirement are explicit follow-up items.

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
- The post-simplification Vercel build shows route JavaScript reduced from 56.18 kB to 14.44 kB (-74.3%) and CSS from 19.60 kB to 6.31 kB (-67.8%). The worker runtime and ONNX WASM remain the main emitted optimisation targets; see `docs/BASELINE.md`.
- Batch processing, ZIP export, brushes, undo/redo, crop, background replacement, shadows, and multi-format export remain outside the initial release.

## Removal decision

No direct dependency was removed in this audit. Each of the eight direct dependencies has a clear role in the current source/build. The first reduction was made by removing out-of-scope application code, not by changing the framework or AI runtime. Targeted security updates were applied where non-major versions were available; the remaining framework/adapter advisories require a major-version review.
