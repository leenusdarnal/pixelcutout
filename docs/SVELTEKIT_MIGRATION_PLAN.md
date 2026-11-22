# SvelteKit Major Migration Plan

**Status:** Planned; implementation not started  
**Decision date:** 2026-11-22  
**Current baseline:** SvelteKit 2.70.4, `@sveltejs/adapter-static` 3.0.11, Svelte 5.57.3, Vite 6.4.6  
**Proposed target:** SvelteKit 3 with a compatible `@sveltejs/adapter-static` 4 release and compatible Svelte/Vite/plugin/TypeScript tooling. Resolve exact versions from official release notes and peer-dependency constraints when implementation begins; do not treat the baseline or audit's suggested versions as a future pin.

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

- [ ] Official migration notes and supported package/Node ranges reviewed; exact target versions recorded.
- [ ] Clean lockfile install succeeds using the repository's Node/npm toolchain.
- [ ] Unit tests, Svelte/TypeScript checks, and production build pass.
- [ ] Static adapter output is complete; deployment remains static and no server runtime is introduced.
- [ ] Production dependency audit has no unresolved production advisories; full audit findings and accepted exceptions are documented.
- [ ] Initial app load does not fetch AI model/runtime assets; inference starts only after the user action.
- [ ] Browser-only image processing, worker lifecycle, cancellation, and WebGPU/WASM fallback remain functional.
- [ ] Privacy/network inspection confirms image pixels are not uploaded or persisted remotely.
- [ ] Desktop/mobile preview checks pass for core AI and manual workflows, before/after preview, and transparent PNG export.
- [ ] Dependency and bundle-size changes are measured and justified; no unrelated dependency or feature scope is added.
- [ ] README, dependency audit, project tracker, and release evidence are updated before merge.

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

## Current state

No package versions, application code, or deployment configuration have been changed for this migration. The current app remains on the SvelteKit 2 baseline until all acceptance gates are met.
