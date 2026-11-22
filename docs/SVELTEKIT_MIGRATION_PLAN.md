# SvelteKit Major Migration Plan

**Status:** Merged to `main` in PR #26 at `c294b979bb88524be6ba9cd4be51d49a7d56a15e`; post-merge browser privacy and device verification remain open
**Decision date:** 2026-11-22
**Pre-migration baseline:** SvelteKit 2.70.4, `@sveltejs/adapter-static` 3.0.11, Svelte 5.57.3, Vite 6.4.6
**Implemented target:** SvelteKit 3.4.0, adapter-static 4.0.1, Svelte 5.57.3, vite-plugin-svelte 7.3.1, Vite 8.3.8, TypeScript 6.0.3, svelte-check 4.7.8; Node.js >=22.17.0 (validated on 22.23.5).

## Goal and constraints

Move the app from SvelteKit 2 to the next major framework/tooling line in a controlled maintenance change, including the adapter-static major upgrade and related config/API changes. Reassess the reported development/build dependency advisories and keep the dependency tree supportable.

Preserve these product constraints:

- Static deployment; no application server or image-processing backend.
- Source and processed image pixels stay in the browser.
- Svelte + TypeScript remains the UI stack; do not introduce a replacement framework.
- AI remains user-initiated and lazy-loaded; inference stays in a Web Worker with WebGPU/WASM fallback.
- Keep one-image-at-a-time scope, manual colour fallback, before/after comparison, and transparent PNG export.
- Keep dependencies and initial-load work minimal. Do not combine this migration with feature work, model changes, or broad refactoring.

## Migration approach

1. **Reconfirm the baseline.** Start from an up-to-date `main`; record Node/npm versions, current lockfile, CI run, package manifest, static output directory, deployment configuration, and current audit results. Reproduce clean install, tests, type checks, and production build before edits.
2. **Read primary migration guidance.** Review official SvelteKit 3 and adapter-static 4 migration guides/release notes, supported Node range, peer dependencies, breaking changes, and current advisories. Confirm the exact compatible package set before editing the manifest.
3. **Create an isolated migration branch.** Keep this work separate from product tasks. Update only framework/build dependencies, required config, and directly necessary compatibility fixes. Avoid broad lockfile churn beyond the dependency resolution.
4. **Upgrade in a reviewable sequence.** Update SvelteKit and adapter-static together; align the Svelte Vite plugin, Vite, Svelte, TypeScript, and check tooling only as required by official compatibility ranges. Regenerate the npm lockfile with the repository's pinned Node/npm toolchain. Do not force transitive overrides without documented evidence.
5. **Resolve migration errors by root cause.** Review SvelteKit config, hooks, routing/load APIs, environment handling, static adapter configuration, prerendering, and service-worker integration. Make the smallest compatible changes and record each breaking-change rationale.
6. **Run the full validation matrix.** Clean `npm ci`; unit tests; Svelte/TypeScript checks; production build; inspect generated static output and routes; verify worker chunks, model/runtime lazy-loading, and absence of image-pixel upload paths; run production and full dependency audits. Compare output and dependency sizes against the recorded baseline.
7. **Verify a preview deployment.** Confirm static assets, deep links/refresh, PWA/service-worker behavior, model asset fetches, and the complete upload → explicit AI action → result → PNG export flow on desktop and mobile. Check manual colour removal and WebGPU/WASM failure recovery.
8. **Merge only after evidence is recorded.** Update the dependency audit, README stack notes, tracker, and this plan with exact versions, CI run, audit findings, deployment evidence, and any remaining limitations. Keep rollback straightforward by reverting the isolated migration commit/PR if preview or production behavior regresses.

## Acceptance gates

- [x] Official migration notes and supported package/Node ranges reviewed; exact target versions recorded.
- [x] Clean lockfile install succeeds using the repository's Node/npm toolchain.
- [x] Unit tests, Svelte/TypeScript checks, and production build pass.
- [x] Static adapter output is complete; deployment remains static and no server runtime is introduced.
- [x] Production dependency audit has no unresolved production advisories; full audit findings and accepted exceptions are documented.
- [ ] Initial app load does not fetch AI model/runtime assets; inference starts only after the user action.
- [ ] Browser-only image processing, worker lifecycle, cancellation, and WebGPU/WASM fallback remain functional.
- [ ] Privacy/network inspection confirms image pixels are not uploaded or persisted remotely.
- [ ] Desktop/mobile preview checks pass for core AI and manual workflows, before/after preview, and transparent PNG export.
- [x] Dependency and bundle-size changes are measured and justified; no unrelated dependency or feature scope is added.
- [x] README, dependency audit, project tracker, and release evidence are updated before merge.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Breaking API/config changes | Follow official migration guide; isolate changes and test each compatibility fix. |
| Adapter or prerender regressions | Inspect generated static output and test deep links/refresh in preview. |
| Runtime or worker bundling changes | Verify worker chunks and lazy-loaded model/runtime behavior in production output and browser network tools. |
| Dependency tree expands or introduces new advisories | Review manifest/lockfile diff and run both production and full audits. |
| Migration obscures product regressions | No feature/model work in this branch; use the existing tracker acceptance checks. |
| Deployment/rollback risk | Preview first; preserve a revertable migration PR and record the last known-good deployment. |

## Out of scope

- Replacing Svelte/SvelteKit with another framework.
- Changing the AI model, image-processing behavior, privacy boundary, or hosting architecture.
- Adding server-side image processing, accounts, analytics, batch processing, or unrelated UI features.
- Forcing major upgrades of unrelated dependencies solely to reduce the audit count.

## Implementation record (2026-11-22)

- Official task-based migration: sv migrate sveltekit-3, using sv 1.7.0; all 12 automated tasks applied.
- Configuration moved from svelte.config.js into the SvelteKit Vite plugin; the obsolete config file was removed.
- tsconfig now extends $app/tsconfig. The service worker and Node test files are excluded from the app TypeScript project; svelte-check reports 0 errors and 0 warnings.
- Replaced $lib imports with the #lib Node subpath alias and migrated the removed $service-worker imports to $app/env, $app/manifest, and $app/paths.
- The service worker still caches only same-origin app output and selected local PWA assets. Remote model downloads and user image data remain excluded.
- Kept adapter-static and the Vercel build output directory; no server runtime or application backend was introduced.
- Clean npm ci, all 34 tests, Svelte checks, Vite production builds (client/server/service worker), and both production/full npm audits pass. The full audit currently reports zero vulnerabilities.
- The generated migration task document was reviewed and removed. Its development-only CORS note is not applicable: the app does not serve static assets cross-origin during local development.
- PR #26 was merged to `main` at `c294b979bb88524be6ba9cd4be51d49a7d56a15e`; the SvelteKit 3 migration is complete.
- PR #27 made documentation and benchmark-validator changes only and was merged at `d4debc2def769fa2a8f45eb69dd083db0e4bf94e`. GitHub Actions run [#132](https://github.com/leenusdarnal/pixelcutout/actions/runs/45052837301) passed on the resulting `main` commit.
- The production deployment for the PR #26 merge remains READY and serves the static app with HTTP 200. The Vercel check for the newer documentation-only commit is blocked by the Vercel build-rate limit; no application-code change is awaiting deployment.

## Post-merge verification

### CI and preview deployment evidence (2026-11-22)

- [x] GitHub Actions run [#120](https://github.com/leenusdarnal/pixelcutout/actions/runs/45030358627) passed: dependency installation, production audit, full advisory report, build, type-check, 34 unit tests, and cleanup steps.
- [x] Vercel preview deployment is READY for commit `82a8e124634d510e781631c4134061131c433ac9`: [preview URL](https://pixelcutout-322089iwd-leenusdarnals-projects.vercel.app) · [deployment details](https://vercel.com/leenusdarnals-projects/pixelcutout/AMDGCe2zo1b1QcQRR5TVjFTXBpUx).
- Automated HTTP inspection was redirected to Vercel login because this preview is protected. Live browser/network and end-to-end device checks therefore remain unverified; deployment protection was not changed.

## Post-merge verification

- [x] PR CI and Vercel preview deployment status pass.
- [ ] Complete browser network inspection with authorized preview access: confirm no model/runtime request before the explicit AI action and no image pixels leave the browser.
- [ ] Complete desktop and mobile workflow checks for AI removal, manual colour fallback, cancellation/replacement, before/after comparison, and transparent PNG export.


## Current post-merge verification snapshot (2026-11-22)

- The production landing page returned HTTP 200. Desktop and mobile viewport captures also returned HTTP 200.
- These checks establish static page availability only. The protected preview's interactive upload, AI inference, manual workflow, and download path have not been tested end to end.
- The browser-control connection was unavailable in this session. Do not mark initial-load network privacy, image-pixel non-upload, or constrained-device memory checks complete without an authorized browser trace and real-device run.
