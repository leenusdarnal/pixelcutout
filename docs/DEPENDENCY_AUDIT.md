# PixelCutout dependency audit

Captured: 2026-11-22  
Reviewed against the project tracker decision to retain the SvelteKit 2 stack and avoid a framework migration.  
Source: current `package.json`, complete npm v3 lockfile, clean install, production build, and `npm audit` results.

## Direct dependencies

| Package | Pinned version | Category | Observed purpose | Decision |
|---|---:|---|---|---|
| `@huggingface/transformers` | 4.3.2 | Runtime | Dynamically imported by `src/lib/workers/remove-background.ts` for AI background removal | Keep; core feature. Benchmark alternatives before replacing it. |
| `svelte` | 5.57.3 | Runtime | UI component framework | Keep. |
| `@sveltejs/adapter-static` | 3.0.11 | Development/build | Emits the static site for deployment | Keep; matches static hosting. |
| `@sveltejs/kit` | 2.70.4 | Development/build | App framework, routing, and build integration | Keep on the approved SvelteKit 2 line; a major framework migration is deferred. |
| `@sveltejs/vite-plugin-svelte` | 5.0.3 | Development | Svelte compilation in Vite | Keep; part of the current SvelteKit 2 toolchain. |
| `svelte-check` | 4.7.8 | Development | Svelte and TypeScript diagnostics | Keep; part of CI verification. |
| `typescript` | 5.8.2 | Development | TypeScript language/compiler support | Keep; source and worker code use TypeScript. |
| `vite` | 6.4.6 | Development | Dev server and production bundler | Keep on the compatible Vite 6 line. |

Direct dependency count: **2 runtime + 6 development**. SvelteKit and the static adapter are build-time tools for this statically deployed application, so they are declared as development dependencies rather than production dependencies.

## Lockfile and reproducibility

- Node: **22.23.5**; npm: **10.9.9**.
- Lockfile: npm **lockfileVersion 3**, regenerated from the exact committed manifest using the same npm version as GitHub Actions.
- The lockfile contains **176 package entries including the root project entry** (87,869 bytes).
- A clean `npm ci --package-lock=true --no-audit --no-fund --onnxruntime-node-install-cuda=skip` completed successfully.
- CI verifies both manifests and the lockfile structure before installing.

## Important transitive packages

| Package | Locked version | Role / observation | Decision |
|---|---:|---|---|
| `onnxruntime-web` | 1.31.0-dev.20260914-8d85527a0 | Browser ONNX execution runtime used by Transformers.js; contributes a large WASM asset | Keep for now; measure model/runtime alternatives in Phase 3. |
| `onnxruntime-node` | 1.30.0 | Node binding brought in by Transformers.js; CI skips the optional CUDA download | Do not add it as a direct dependency. Revisit only if server-side Node inference becomes a requirement. |
| `sharp` | 0.35.5 | Transformers.js transitive dependency; not imported by application source | Do not remove by hand from the lockfile. Reassess the runtime dependency graph when evaluating AI alternatives. |
| `cookie` | 0.6.0 | Transitive SvelteKit dependency; currently reported as a low-severity development-tool advisory | Leave to the framework's compatible dependency update rather than forcing an out-of-range override. |

## Security audit (2026-11-22)

The regenerated dependency tree was checked with npm 10.9.9.

| Audit scope | Critical | High | Moderate | Low | Total |
|---|---:|---:|---:|---:|---:|
| Full dependency tree | 0 | 1 | 0 | 2 | 3 |
| Production dependencies (`npm audit --omit=dev`) | 0 | 0 | 0 | 0 | 0 |

The remaining findings are in development/build dependencies:

| Package | Severity | Affected range reported by npm | Fix npm offers | Assessment |
|---|---|---|---|---|
| `@sveltejs/kit@2.70.4` | High | `<=3.1.0` | `@sveltejs/kit@3.4.0` (major) | The compatible SvelteKit 2 line has no fix offered by the current audit data. |
| `@sveltejs/adapter-static@3.0.11` | Low | `1.0.0-next.0 - 3.0.11` | `@sveltejs/adapter-static@4.0.1` (major) | Adapter 4 requires SvelteKit 3. |
| `cookie@0.6.0` | Low | `<0.7.0` | Resolved through `@sveltejs/kit@3.4.0` (major) | Avoid an out-of-range forced transitive override. |

**Interpretation:** npm reports zero vulnerabilities in the production dependency tree. The three remaining findings are present in the development/build toolchain; this does not mean the toolchain is vulnerability-free, but these packages are not part of the production dependency tree for the static deployment.

**Migration decision:** the project tracker explicitly says to keep the existing SvelteKit + Svelte + TypeScript stack and not introduce a framework migration. Clearing all remaining findings currently requires SvelteKit 3 and adapter-static 4, plus a major toolchain/configuration migration. That work is deferred rather than silently overriding the agreed project decision. Revisit it as a separate, explicitly approved migration. CI now blocks on production dependency advisories and reports the full dependency audit for visibility.

## Local modules and lightweight scope

The following local modules remain in the focused first-release path:

- Manual colour removal: `src/lib/image/remove-color.js`.
- Image header validation: `src/lib/image/image-dimensions.js` reads PNG/JPEG/WebP dimensions from a bounded header slice and is dynamically imported only after file selection; it adds no package dependency.
- The background-removal worker: `src/lib/workers/remove-background.ts`.
- Manual colour tests: `src/lib/image/remove-color.test.mjs`.

No batch/ZIP, separate editor, state-management, or UI component package is needed for the current first-release scope. The worker is created only when a removal action starts, and Transformers.js is dynamically imported only for AI removal.

## Validation

Validated from a clean checkout on Node 22.23.5 / npm 10.9.9:

- `npm ci --package-lock=true --no-audit --no-fund --onnxruntime-node-install-cuda=skip` — passed.
- `npm run build` — passed.
- Unit tests — **34 passed, 0 failed**.
- `svelte-check` — **0 errors, 0 warnings**.
- Vite 6.4.6 production build and static adapter — passed.
- `npm audit --omit=dev` — **0 vulnerabilities**.
- Full `npm audit` — **3 development/build findings** as detailed above.

No application feature, image-processing mode, or AI model has been changed by this dependency cleanup.
