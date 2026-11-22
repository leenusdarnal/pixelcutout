# PixelCutout dependency audit

Captured: 2026-11-22
Current baseline after SvelteKit 3 migration PR #26 was merged to `main` at commit `c294b979bb88524be6ba9cd4be51d49a7d56a15e`. PR #27 subsequently merged documentation-only updates at `d4debc2def769fa2a8f45eb69dd083db0e4bf94e`; application code and dependencies were unchanged.
Source: package manifest, npm v3 lockfile, clean npm install, production build, and npm audit results.

## Current direct dependencies

| Package | Pinned version | Category | Purpose |
|---|---:|---|---|
| @huggingface/transformers | 4.3.2 | Runtime | Dynamically imported by the AI worker for background removal |
| svelte | 5.57.3 | Runtime | UI component framework |
| @sveltejs/adapter-static | 4.0.1 | Development/build | Emits the static site for deployment |
| @sveltejs/kit | 3.4.0 | Development/build | App framework, routing, and build integration |
| @sveltejs/vite-plugin-svelte | 7.3.1 | Development | Svelte compilation in Vite |
| svelte-check | 4.7.8 | Development | Svelte and TypeScript diagnostics |
| typescript | 6.0.3 | Development | TypeScript compiler |
| vite | 8.3.8 | Development | Dev server and production bundler |

Direct dependency count remains **2 runtime + 6 development**. No runtime package was added for this migration. SvelteKit and adapter-static remain build-time tools for this static application.

## Runtime requirements and compatibility

- Node.js: **>=22.17.0** (tested with **22.23.5**); npm: **10.9.9**.
- SvelteKit 3.4.0 peer requirements: Node >=22.17, Svelte ^5.57.1, TypeScript ^6, Vite ^8.0.12, and @sveltejs/vite-plugin-svelte ^7.
- The pinned Svelte 5.57.3, TypeScript 6.0.3, Vite 8.3.8, and plugin 7.3.1 meet those ranges.
- The committed npm lockfile uses lockfileVersion 3 and is regenerated from the exact pinned manifest.
- CI continues to use Node 22, which satisfies the framework minimum; the package manifest now records the minimum supported Node version.

## Security audit

| Audit | Result |
|---|---|
| npm audit --omit=dev --audit-level=low | **0 vulnerabilities** |
| Full npm audit | **0 vulnerabilities** |

The pre-migration SvelteKit 2 dependency tree had three reported findings: one high finding against SvelteKit 2.70.4, one low finding against adapter-static 3.0.11, and one low finding in cookie 0.6.0. After moving to SvelteKit 3.4.0 and adapter-static 4.0.1 and regenerating the lockfile, the full audit reports zero findings. No forced transitive override was added for this migration.

CI continues to block on production dependency advisories and reports the full dependency audit for visibility.

## Build footprint and static output

The pre-migration production build emitted a 598.72 KB worker chunk and a 26,861.78 KB ONNX Runtime WASM asset. The SvelteKit 3/Vite 8 build emits a 582.62 KB worker chunk and a 26,861.77 KB WASM asset. The large runtime remains a worker asset and is not added as a new application-entry dependency. These figures are build-output measurements, not a browser network test.

The adapter-static 4 production build writes the site to build/, including index.html, 404.html, manifest.webmanifest, the app icon, and service-worker.js. Vercel outputDirectory remains build/. No server adapter or image-processing backend was introduced.

## Local modules and lightweight scope

The focused first-release modules remain:

- Manual colour removal: src/lib/image/remove-color.js.
- Image header validation: src/lib/image/image-dimensions.js; reads bounded PNG/JPEG/WebP headers and adds no package.
- Background-removal worker: src/lib/workers/remove-background.ts.
- Manual colour tests: src/lib/image/remove-color.test.mjs.

The worker is created only when a removal action starts, and Transformers.js remains dynamically imported only in the AI worker path. The service worker now imports version from $app/env, manifest asset metadata from $app/manifest, and resolves paths through $app/paths. It retains the existing same-origin-only handling and does not cache remote model downloads or user-selected image data.

No batch/ZIP, separate editor, state-management, analytics, or UI component package was added.

## Validation

Validated in a clean Node 22.23.5 / npm 10.9.9 environment:

- npm ci --package-lock=true --no-audit --no-fund --onnxruntime-node-install-cuda=skip — passed.
- npm run build — passed.
- Unit tests — **34 passed, 0 failed**.
- svelte-check — **0 errors, 0 warnings**.
- Vite 8.3.8 production client/server/service-worker builds — passed.
- adapter-static 4.0.1 — wrote the static site to build/.
- npm audit --omit=dev --audit-level=low — **0 vulnerabilities**.
- Full npm audit — **0 vulnerabilities**.

The application workflow, model, and image-processing logic were not otherwise changed. The latest main-branch GitHub Actions run [#132](https://github.com/leenusdarnal/pixelcutout/actions/runs/45052837301), after PR #27, passed. Browser network inspection and interactive desktop/mobile preview checks remain outstanding and are tracked in docs/SVELTEKIT_MIGRATION_PLAN.md.
