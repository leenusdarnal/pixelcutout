# PixelCutout Project Tracker

> Living implementation tracker. Update this file as work is completed. Keep changes small, measurable, and aligned with the privacy-first, browser-only product.

**Tracker version:** 1.1
**Status:** Implementation in progress
**Last updated:** 2026-11-22
**Product:** PixelCutout — one-image-at-a-time background removal
**Reference document:** `pixelcutout_project_tracker.docx` (project tracker document)

## 1. Product decisions (locked)

- [x] AI automatic background removal is the primary workflow; manual colour removal is an advanced fallback.
- [x] Support broad image subjects; prioritise fine edges and difficult images.
- [x] Process image pixels entirely in the browser. Never upload source or processed image pixels.
- [x] Handle one image at a time.
- [x] User explicitly clicks **Remove Background** to start inference.
- [x] Show before/after comparison and allow transparent PNG download.
- [x] Keep the UI modern, minimal, and focused.

## 2. Lightweight guardrails

- [x] Keep the SvelteKit + Svelte + TypeScript stack lightweight. The SvelteKit 3 and adapter-static 4 upgrade is isolated in a maintenance branch with no feature/model scope.
- [ ] Prefer existing utilities and browser APIs over new dependencies.
- [ ] Add a dependency only when a measured requirement cannot be met with the current stack; record its size and rationale.
- [ ] Load the AI runtime and model only after the user clicks **Remove Background**; never preload them on initial page load.
- [ ] Use one selected model/runtime path at a time; avoid shipping multiple production models without benchmark evidence.
- [ ] Keep inference in a Web Worker where supported; preserve the existing WebGPU/WASM fallback strategy.
- [ ] Keep the model asset separate from the initial app bundle and cache it safely where appropriate.
- [ ] Enforce both file-size and decoded-pixel/dimension limits before allocating large buffers; show a useful error.
- [ ] Process one image only; no batch queues, ZIP export, accounts, history, cloud storage, or backend image APIs in the initial release.
- [ ] Avoid adding a design system, state library, analytics, or server infrastructure for this scope.
- [ ] Revoke object URLs, release image/canvas/worker resources, and clear references when replacing or leaving an image.
- [ ] Measure initial bundle, model download, inference time, and peak memory on representative desktop and mobile devices before claiming performance.
- [ ] Do not sacrifice output quality or privacy for an arbitrary small bundle target; document measured trade-offs.

### SvelteKit 3 migration (maintenance track)

- [x] Upgrade to SvelteKit 3.4.0 and adapter-static 4.0.1 with compatible Svelte/Vite/TypeScript tooling.
- [x] Move framework configuration into vite.config.ts and remove svelte.config.js.
- [x] Replace the $lib alias with the #lib Node subpath import and migrate service-worker APIs.
- [x] Keep static deployment, worker-based processing, lazy AI runtime loading, and the existing image privacy boundary unchanged.
- [x] Verify clean npm ci, 34 tests, 0 Svelte/TypeScript errors or warnings, static production build, and zero findings in both npm audits.
- [x] Verify pull-request CI and successful Vercel preview deployment status (PR #26, GitHub Actions run #120; Vercel deployment READY).
- [ ] Complete browser network privacy inspection and desktop/mobile workflows with authorized access to the protected preview.
## 3. Status legend

Use one status per task: **Open**, **In progress**, **Blocked**, or **Done**. Add owner, date, PR/commit, and evidence when useful. Do not mark a task Done without its acceptance check.

## 4. Work tracker

### Phase 0 — Baseline and guardrails

| ID | Task | Acceptance check | Status | Notes / evidence |
|---|---|---|---|---|
| P0-01 | Record current branch, commit, install/build/test commands, and CI status | Baseline is reproducible from a clean checkout | Done | Clean `npm ci` and `npm run build` passed on Node 22 in CI run [#24](https://github.com/leenusdarnal/pixelcutout/actions/runs/45001169884). |
| P0-02 | Record current bundle size and identify largest initial-load assets | Baseline numbers captured before changes | Done | Pre-simplification Vite sizes recorded in `docs/BASELINE.md`; worker chunk 902.08 kB and ONNX WASM 21,596.02 kB are emitted worker/runtime assets, not assumed initial-route downloads. |
| P0-03 | Inventory current dependencies and identify removable/duplicate packages | No dependency removed without checking usage | Done | Direct and key transitive dependency audit recorded in `docs/DEPENDENCY_AUDIT.md`; no direct package was removed. |
| P0-04 | Confirm privacy boundary for image pixels and model downloads | Docs/UI clearly distinguish local pixels from model asset downloads | Done | UI, worker and service-worker code reviewed; local image processing and separate model downloads are documented. Live browser network inspection remains P2-05. |

### Phase 1 — Focused app flow

| ID | Task | Acceptance check | Status | Notes / evidence |
|---|---|---|---|---|
| P1-01 | Simplify landing page to one-image upload/drop zone | Keyboard and pointer upload work; one image is shown | Done | One-file picker, keyboard-operable Select image button, drag/drop and image paste retained in `src/routes/+page.svelte`; browser device QA remains in P6-02. |
| P1-02 | Keep AI removal as the primary action; start only on click | No model/runtime fetch or inference before click | Done | AI is the single primary action; manual colour removal is under Advanced. Worker creation starts from the removal action and Transformers.js is imported only in the AI worker path. |
| P1-03 | Remove batch-processing UI from first-release path | No batch queue or ZIP workflow is exposed | Done | Removed `BatchProcessor`, ZIP writer, and ZIP-specific tests. |
| P1-04 | Remove advanced Studio features not in first-release scope | No brush editor, crop, background replacement, shadows, or extra export formats in core flow | Done | Removed `StudioEditor`, brush/crop/background/shadow features, clipboard export, and unused alpha-feather utility/tests; retained before/after preview and PNG export. |
| P1-05 | Add clear loading, success, empty, and error states | State transitions are understandable and recoverable | Done | Empty/upload, AI download/processing progress, cancel, result, and error states remain in the focused flow; verified by successful CI and production build. |

### Phase 2 — Image safety and resource lifecycle

| ID | Task | Acceptance check | Status | Notes / evidence |
|---|---|---|---|---|
| P2-01 | Validate file type, file size, decoded dimensions, and pixel count | Invalid/oversized files are rejected before heavy allocation | Done | `image-dimensions.js` reads at most 2 MB of header data; supports PNG/JPEG/WebP; rejects over 16 MP or 10,000 px per side before preview/worker allocation. Ten focused tests; all 17 tests passed in [CI run](https://github.com/leenusdarnal/pixelcutout/actions/runs/45002723970). |
| P2-02 | Handle replacement while loading or processing | Previous work is cancelled/ignored safely; new image becomes current | Done | Selection request tokens discard stale header-validation results; replacing/resetting terminates the previous worker, and worker identity checks ignore queued events from a superseded worker. Verified by [CI run](https://github.com/leenusdarnal/pixelcutout/actions/runs/45002294789); manual device QA remains in P6-02. |
| P2-03 | Add cancellation/reset path where feasible | User can recover from long processing without stale results | Done | Cancel terminates the active worker and clears progress; a later attempt creates a fresh worker. Worker identity checks prevent cancelled work from updating the current UI. Verified by [CI run](https://github.com/leenusdarnal/pixelcutout/actions/runs/45002294789). |
| P2-04 | Release object URLs, canvases, buffers, and worker resources | Repeated image replacements do not accumulate retained resources | In progress | Object URLs are revoked and workers terminated on replacement/reset/unmount; manual `ImageBitmap`s are closed; temporary `ImageData` and `OffscreenCanvas` backing stores are cleared after PNG encoding. Automated checks pass in [CI run](https://github.com/leenusdarnal/pixelcutout/actions/runs/45002425468). Repeated-image memory profiling on constrained mobile devices remains pending (P6-02). |
| P2-05 | Keep image data out of server requests, logs, analytics, and persistence | Network inspection confirms no image-pixel upload or storage | In progress | Static review: source `Blob` is passed to the local worker; app code does not post image bytes to an application endpoint; the service worker intercepts only same-origin GET requests and does not cache cross-origin model downloads. Live browser network inspection is still required before marking Done. |

### Phase 3 — AI quality and runtime

| ID | Task | Acceptance check | Status | Notes / evidence |
|---|---|---|---|---|
| P3-01 | Define a small representative benchmark set | Includes people/hair, pets/fur, products, everyday objects, fine edges, and difficult backgrounds | In progress | The 16-case matrix and scoring protocol are defined in `docs/MODEL_BENCHMARK.md`. The actual locally sourced image files, usage rights, and SHA-256 manifest still need to be populated before model comparisons. |
| P3-02 | Benchmark current model against viable general-purpose alternatives | Quality, model size, cold-start, inference time, memory, WebGPU/WASM, and licensing recorded | Open | |
| P3-03 | Select the smallest model that meets quality targets | Decision includes measured trade-offs; no redundant model shipped | Open | |
| P3-04 | Keep inference off the main thread | UI remains responsive during inference on supported devices | Done | AI and manual processing run in `src/lib/workers/remove-background.ts` via a module Web Worker; the worker is created only after the user starts removal. CI build and checks passed in [run #54](https://github.com/leenusdarnal/pixelcutout/actions/runs/45003620067). Real-device responsiveness checks remain in P6-02. |
| P3-05 | Add graceful WebGPU/WASM/runtime failure handling | Unsupported or failed runtime produces a recoverable message | Done | Added tested WebGPU-to-WASM fallback for initialization and inference failures; failed WebGPU sessions are disposed before switching, WASM is reused for later images, and WASM errors propagate to the UI's recoverable error state. Five focused fallback tests; full CI passed with 22 tests, 0 type errors/warnings, and a successful production build in [run #54](https://github.com/leenusdarnal/pixelcutout/actions/runs/45003620067). |
| P3-06 | Document model source, license, version, and update procedure | Model provenance and update path are recorded | Open | |

### Phase 4 — Result and export

| ID | Task | Acceptance check | Status | Notes / evidence |
|---|---|---|---|---|
| P4-01 | Build accessible before/after comparison | Slider works with pointer, touch, and keyboard; labels are clear | Done | Full-preview native range control with keyboard support, touch/pointer hit area, visible divider/handle, clear Original/Background removed labels, and live `aria-valuetext`. Verified in production build: 22/22 tests pass, Svelte check 0 errors/0 warnings, Vite build succeeds; deployment [READY](https://vercel.com/leenusdarnals-projects/pixelcutout/Hs819iGv9ZwtocsdC6WUxCEeaRwB) for commit `110ffb7939c2294c2db6a3f72482db8a99069cde`. Real-device interaction QA remains P6-02. |
| P4-02 | Show transparency with a lightweight checkerboard | Transparent areas are distinguishable without obscuring edges | Done | Default `checker` preview mode uses CSS-only checkerboard; Light and Dark preview backgrounds remain available. No dependency or image asset added. Verified in `src/routes/+page.svelte`; real-device visual QA remains P6-02. |
| P4-03 | Export a full-resolution transparent PNG | Alpha channel and model output dimensions are preserved | Done | Added `src/lib/image/png-output.js`: validates positive safe dimensions and exactly `width × height × 4` RGBA bytes before canvas allocation, copies RGBA without changing alpha, writes PNG at the model output dimensions, validates the encoded Blob, and clears temporary pixel/canvas memory on success or failure. Three focused tests cover transparent/semi-transparent pixels, malformed buffers, and failure cleanup. Verified in production build [READY](https://vercel.com/leenusdarnals-projects/pixelcutout/6UyfeL1PNg8RMSvtd85w8MjYtqD2) for commit `fa18ef77d6f5d9cf19b6c57140df01e9cdffe37c`; 25/25 tests pass and Svelte check reports 0 errors/0 warnings. Real output QA with varied source images remains P6-04. |
| P4-04 | Add Try another / reset flow | New image starts cleanly and prior resources are released | Done | Added `src/lib/image/resource-lifecycle.js` and tests. Worker is terminated before object URLs are revoked; duplicate/empty URLs are handled safely. Selection change, method change, cancellation, reset, worker error, and unmount now use the shared cleanup path; old results are ignored by existing worker guards. Result screen action is now “Try another image”. Verified in production build [READY](https://vercel.com/leenusdarnals-projects/pixelcutout/5AFiGXtkRXWApsWvSdsCWkMAaLKk) for commit `e045a79731c0e8db5ab2c1d30de04030d473c87f`; 28/28 tests pass and Svelte check is 0 errors/0 warnings. Manual multi-image/device QA remains P6-02. |

### Phase 5 — Advanced manual colour removal

| ID | Task | Acceptance check | Status | Notes / evidence |
|---|---|---|---|---|
| P5-01 | Expose manual colour removal under Advanced | Hidden from the primary path until requested | Done | Manual colour removal remains behind the **Advanced: manual colour removal** toggle; AI remains the primary Remove background action. Manual mode does not load Transformers.js or download AI model assets. Verified in production build [READY](https://vercel.com/leenusdarnals-projects/pixelcutout/9kQDwiUHZuTncCpqPgLpZLMC5DY1) for commit `c6c8ac082a40262ea00bc4fc358bcf29b09473ae`. |
| P5-02 | Sample colour and adjust tolerance with preview | Changes are previewed before application | Done | Click-to-sample source colour, adjustable tolerance, and a 120 ms debounced preview capped at 512 px on the longest side. Preview uses a temporary local canvas; applying still uses the original image at full resolution. Preview output is not downloadable until the same colour/tolerance is applied. No dependency added. Verified in production build [READY](https://vercel.com/leenusdarnals-projects/pixelcutout/9kQDwiUHZuTncCpqPgLpZLMC5DY1) for commit `c6c8ac082a40262ea00bc4fc358bcf29b09473ae`. |
| P5-03 | Apply/reset manual removal without destroying AI result | Reset returns to AI result/original; no cumulative destructive edits | Done | AI output (`cutout`) and full-resolution manual output (`manualResult`) are stored independently. Manual runs start from the original source, **Choose again** returns to the original for sampling, and switching modes retains both committed outputs. A reduced preview is replaced only when a full-resolution manual result completes. Verified in production build [READY](https://vercel.com/leenusdarnals-projects/pixelcutout/9kQDwiUHZuTncCpqPgLpZLMC5DY1) for commit `c6c8ac082a40262ea00bc4fc358bcf29b09473ae`. |
| P5-04 | Keep existing colour-removal tests and add edge cases | Tests cover tolerance, transparency, and reset behaviour | Done | Nine colour-removal tests cover exact matches, tolerance boundaries/feathering, preserved foreground alpha/RGB, already-transparent pixels, tolerance clamping, and invalid input. Two new regression tests verify RGB channels are unchanged by feathering and alpha is never increased; resource lifecycle tests cover worker termination and URL cleanup. Full build reports 30/30 tests passing. [READY deployment](https://vercel.com/leenusdarnals-projects/pixelcutout/9kQDwiUHZuTncCpqPgLpZLMC5DY1). |
| P5-05 | Make manual colour sampling keyboard accessible | Keyboard activation selects a predictable sample point | Done | Added `getBackgroundSamplePoint()` helper: pointer/touch maps to the exact displayed source pixel; keyboard activation samples the image centre. Four tests cover pointer scaling, edge clamping, keyboard sampling, and invalid bounds. Production build [READY](https://vercel.com/leenusdarnals-projects/pixelcutout/EjAwJHYEiaW7rp59P7g7Fn9yXgR9) for commit `4e5198f19a41476de35f80ae0e83adbc63223b6e`. |

### Phase 6 — QA, documentation, and release

| ID | Task | Acceptance check | Status | Notes / evidence |
|---|---|---|---|---|
| P6-01 | Run type checks, unit tests, and production build | All required CI checks pass | Done | Latest validated production build on `main`: 34 tests passed, 0 failed; `svelte-check` 0 errors/0 warnings; Vite client/server build and static adapter completed. Deployment [READY](https://vercel.com/leenusdarnals-projects/pixelcutout/EjAwJHYEiaW7rp59P7g7Fn9yXgR9) for commit `4e5198f19a41476de35f80ae0e83adbc63223b6e`. Vercel/npm environment warnings remain informational and did not fail the build. |
| P6-02 | Test desktop and mobile, including constrained memory | No crash or unusable state on supported test devices | Open | |
| P6-03 | Verify privacy claims with browser network inspection | No image pixels leave the browser | Open | |
| P6-04 | Verify PNG dimensions, alpha, and edge quality | Output meets benchmark acceptance criteria | Open | |
| P6-05 | Update README with workflow, limits, privacy, and model details | Documentation matches shipped behaviour | Done | README now documents the advanced manual sample/tolerance flow, 512 px preview limit, full-resolution apply step, independent AI/manual results, and the download guard. Existing file limits, privacy boundaries, model provenance, runtime fallback, and lightweight scope are retained. |
| P6-06 | Deploy preview and verify; record Vercel quota issues separately | Preview is verified; quota failures are not mislabelled as app failures | Open | |

## 5. Model benchmark scorecard

Record each candidate with the same image set and device/runtime conditions.

| Candidate / version | Model download size | Cold-start time | Median inference | Peak memory | WebGPU | WASM | Quality notes | License / source |
|---|---:|---:|---:|---:|---|---|---|---|
| Current model | — | — | — | — | — | — | Existing MODNet is primarily portrait-oriented; benchmark before deciding | — |
| Candidate A | — | — | — | — | — | — | — | — |
| Candidate B | — | — | — | — | — | — | — | — |

**Decision rule:** choose the lightest candidate that meets the agreed quality and device-compatibility bar. Do not select by model size alone.

## 6. Performance and privacy evidence

| Measure / check | Baseline | Target / decision | Result | Evidence |
|---|---|---|---|---|
| Initial JS/CSS transfer (excluding model) | TBD | Keep minimal; avoid unrelated dependencies | TBD | |
| Model asset size | TBD | Lazy-loaded; choose after benchmark | TBD | |
| Time to interactive before model load | TBD | No model work on initial load | TBD | |
| Inference time on desktop | TBD | Record by image and runtime | TBD | |
| Inference time on mobile | TBD | Record by image and runtime | TBD | |
| Peak memory on mobile | TBD | Respect tested image/pixel limits | TBD | |
| Image upload/network requests | TBD | **Zero image-pixel uploads** | TBD | |
| Resource cleanup after replacement | TBD | No accumulating object URLs/buffers/workers | TBD | |

## 7. Risks and mitigations

| Risk | Mitigation | Status |
|---|---|---|
| Portrait model performs poorly on non-human subjects | Benchmark general-purpose models before locking production model | Open |
| Large images exhaust mobile memory | Validate decoded dimensions/pixels; process with bounded buffers; test mobile | Open |
| WebGPU unavailable or unstable | Keep tested WASM fallback and explain slower processing | Open |
| Model download makes first use feel slow | Lazy-load only after click; show progress; cache model assets appropriately | Open |
| Manual fallback alters AI result destructively | Keep a stable AI result and make manual changes reversible | Open |
| Vercel free deployment quota blocks preview | Track as hosting quota issue separately from build/CI status | Open |
| Scope expands and increases bundle/maintenance | Use the lightweight guardrails; defer non-core features | Open |

## 8. Release checklist

- [ ] One image at a time; explicit Remove Background click starts processing.
- [ ] Image pixels remain in the browser; network inspection confirms no upload.
- [ ] Unsupported and oversized files fail safely with a useful message.
- [ ] AI result is compared with original and can be downloaded as transparent PNG.
- [ ] Manual colour removal is clearly advanced and reversible.
- [ ] Worker/runtime failures and cancellation/replacement are recoverable.
- [ ] Desktop and mobile checks pass, including memory-constrained testing.
- [ ] Initial-load and model performance measurements are recorded.
- [ ] Type checks, tests, production build, and CI pass.
- [ ] README, privacy text, model provenance, and known limits are current.
- [ ] Preview deployment is verified; deployment quota incidents are recorded separately.

## 9. Decision log

| Date | Decision | Reason / evidence |
|---|---|---|
| 2026-11-22 | Browser-only image processing; no image uploads | Privacy requirement |
| 2026-11-22 | One image at a time; AI primary; manual colour removal advanced | Keep the product focused and lightweight |
| 2026-11-22 | Explicit user click starts inference | Avoid unexpected CPU/GPU work and model downloads |
| 2026-11-22 | Before/after comparison and transparent PNG are the core result | Minimal, useful output flow |
| 2026-11-22 | Benchmark model options before changing the current model | Quality and bundle/runtime trade-offs need evidence |
| 2026-11-22 | Implement SvelteKit 3.4.0 and adapter-static 4.0.1 on an isolated maintenance branch | Preserve static hosting and browser-only processing; full npm audit is clean. PR #26 CI run #120 passed and Vercel preview is READY; protected-preview browser privacy and device checks remain before merge |

## 10. Deferred / out of scope for first release

- Batch processing, queues, ZIP export.
- Accounts, cloud history, cloud storage, backend image processing.
- Brush editing, crop, background replacement, shadows, multi-format export.
- Multiple production models without benchmark justification.
- Analytics or telemetry that could collect image data.
- Unrelated framework upgrades or feature work bundled into the completed SvelteKit 3 maintenance change.

---

**Working rule:** complete and verify the smallest useful slice before starting the next. Update this tracker in the same change as implementation work; link PRs, commits, test output, and benchmark evidence in the Notes / evidence column.
