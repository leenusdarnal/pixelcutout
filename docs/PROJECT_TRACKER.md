# PixelCutout Project Tracker

> Living implementation tracker. Update this file as work is completed. Keep changes small, measurable, and aligned with the privacy-first, browser-only product.

**Tracker version:** 1.6
**Status:** UI refresh deployed; browser/device QA and model benchmark gates remain
**Last updated:** 2026-11-23
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

- [x] Keep the SvelteKit + Svelte + TypeScript stack lightweight. The SvelteKit 3 and adapter-static 4 upgrade is merged to main with no feature/model scope.
- [x] Prefer existing utilities and browser APIs over new dependencies; no additional runtime dependency was introduced.
- [ ] Add a dependency only when a measured requirement cannot be met with the current stack; record its size and rationale.
- [x] Load the AI runtime and model only after the user clicks **Remove Background**; never preload them on initial page load.
- [x] Use one selected model/runtime path at a time; avoid shipping multiple production models without benchmark evidence.
- [x] Keep inference in a Web Worker where supported; preserve the existing WebGPU/WASM fallback strategy.
- [x] Keep the model asset separate from the initial app bundle and cache it safely where appropriate.
- [x] Enforce both file-size and decoded-pixel/dimension limits before allocating large buffers; show a useful error.
- [x] Process one image only; no batch queues, ZIP export, accounts, history, cloud storage, or backend image APIs in the initial release.
- [x] Avoid adding a design system, state library, analytics, or server infrastructure for this scope.
- [x] Revoke object URLs, release image/canvas/worker resources, and clear references when replacing or leaving an image; device memory profiling remains open in P6-02.
- [ ] Measure initial bundle, model download, inference time, and peak memory on representative desktop and mobile devices before claiming performance.
- [ ] Do not sacrifice output quality or privacy for an arbitrary small bundle target; document measured trade-offs.

### SvelteKit 3 migration (maintenance track)

- [x] Upgrade to SvelteKit 3.4.0 and adapter-static 4.0.1 with compatible Svelte/Vite/TypeScript tooling.
- [x] Move framework configuration into vite.config.ts and remove svelte.config.js.
- [x] Replace the $lib alias with the #lib Node subpath import and migrate service-worker APIs.
- [x] Keep static deployment, worker-based processing, lazy AI runtime loading, and the existing image privacy boundary unchanged.
- [x] Verify clean npm ci, 34 tests, 0 Svelte/TypeScript errors or warnings, static production build, and zero findings in both npm audits.
- [x] Verify pull-request CI and successful Vercel preview deployment status (PR #26, GitHub Actions run #122; Vercel deployment READY).
- [ ] Complete browser network privacy inspection and desktop/mobile workflows with authorized access to the protected preview; migration is merged.
## 3. Status legend

Use one status per task: **Open**, **In progress**, **Blocked**, or **Done**. Add owner, date, PR/commit, and evidence when useful. Do not mark a task Done without its acceptance check.

## 4. Work tracker

### Phase 0 — Baseline and guardrails

| ID | Task | Acceptance check | Status | Notes / evidence |
|---|---|---|---|---|
| P0-01 | Record current branch, commit, install/build/test commands, and CI status | Baseline is reproducible from a clean checkout | Done | Main HEAD after PR #27 is `d4debc2def769fa2a8f45eb69dd083db0e4bf94e`; GitHub Actions run [#132](https://github.com/leenusdarnal/pixelcutout/actions/runs/45052837301) passed on the merge commit. |
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
| P2-04 | Release object URLs, canvases, buffers, and worker resources | Repeated image replacements do not accumulate retained resources | In progress | Object URLs are revoked, workers terminated, and manual ImageBitmaps closed. Extracted the full-resolution manual worker operation into `src/lib/workers/manual-processing.js` and added dependency-free tests for successful PNG encoding, missing worker APIs, unavailable 2D context, invalid decoded-frame dimensions, and cleanup after encoding failure. Tests verify temporary ImageData is zeroed, OffscreenCanvas dimensions are reset, and ImageBitmap is closed on success and failure. Repeated-image peak-memory profiling on a constrained mobile device remains pending (P6-02). |
| P2-05 | Keep image data out of server requests, logs, analytics, and persistence | Network inspection confirms no image-pixel upload or storage | In progress | Static review confirms source `Blob` values are passed to the local worker; the AI runtime is imported only inside the AI model path; manual removal uses the local pixel-processing path; and the service worker bypasses non-GET/cross-origin requests while caching only compiled app/PWA assets. Added `src/privacy-contract.test.mjs` to guard these source-level boundaries without dependencies. Live browser network inspection is still required to verify actual requests and confirm model/runtime downloads begin only after the user's explicit action. |

### Phase 3 — AI quality and runtime

| ID | Task | Acceptance check | Status | Notes / evidence |
|---|---|---|---|---|
| P3-01 | Define a small representative benchmark set | Includes people/hair, pets/fur, products, everyday objects, fine edges, and difficult backgrounds | In progress | Added `docs/BENCHMARK_FIXTURE_ACQUISITION.md`: AIM-500 is the primary alpha-matte source subject to image-level rights verification; Open Images V7 is a binary-mask-only fallback. B01-B16 are mapped to source categories and rights gates. The manifest remains empty because no dataset pixels have been acquired and no per-image rights approvals are available. |
| P3-02 | Benchmark current model against viable general-purpose alternatives | Quality, model size, cold-start, inference time, memory, WebGPU/WASM, and licensing recorded | In progress | Retain MODNet as production baseline and BiRefNet Lite as the general-purpose candidate pending the benchmark. The new acquisition checklist identifies AIM-500 as the preferred soft-alpha source and Open Images V7 as a separately reported binary-mask extension. No fixture has passed image-level rights review and no PixelCutout scores/device measurements exist yet; keep MODNet in production. See `docs/MODEL_BENCHMARK.md`, `docs/BENCHMARK_FIXTURE_ACQUISITION.md`, and `docs/MODEL_PROVENANCE.md`. |
| P3-03 | Select the smallest model that meets quality targets | Decision includes measured trade-offs; no redundant model shipped | Open | |
| P3-04 | Keep inference off the main thread | UI remains responsive during inference on supported devices | Done | AI and manual processing run in `src/lib/workers/remove-background.ts` via a module Web Worker; the worker is created only after the user starts removal. CI build and checks passed in [run #54](https://github.com/leenusdarnal/pixelcutout/actions/runs/45003620067). Real-device responsiveness checks remain in P6-02. |
| P3-05 | Add graceful WebGPU/WASM/runtime failure handling | Unsupported or failed runtime produces a recoverable message | In progress | The existing fallback is unit-tested. Live QA exposed a Transformers.js 4.3.2 edge case: when `navigator.gpu` exists but `requestAdapter()` returns null, a failed WebGPU session can poison ONNX's shared web session chain and the same-worker WASM fallback repeats the old error. Added and merged adapter preflight in PR #34 at `6ce5bb0`; the worker now selects WASM directly for missing/null/throwing adapter discovery. Upstream fix [Transformers.js #1780](https://github.com/huggingface/transformers.js/pull/1780) merged on 2026-11-23 but is not yet in published npm 4.3.2. The production build is green; rerun synthetic AI inference and adopt the upstream fix once released. |
| P3-06 | Document model source, license, version, and update procedure | Model provenance and update path are recorded; runtime revision is safely reproducible | In progress | `docs/MODEL_PROVENANCE.md` records the model ID, observed Hub commit, Apache-2.0 metadata, file variants, and update steps. As checked 2026-11-22, the upstream release page still lists Transformers.js 4.3.2 as latest; revision-propagation issue [#1893](https://github.com/huggingface/transformers.js/issues/1893) is not fixed in a published release, and fix PR [#1942](https://github.com/huggingface/transformers.js/pull/1942) was closed as superseded. Do not pin until a released fix and browser network proof are available. |
| P3-07 | Validate benchmark manifest paths, rights metadata, image/matte hashes, and alpha-only completeness in CI | CI rejects missing/unsafe files, bad hashes, mismatched dimensions, unverified rights, and binary masks in the alpha benchmark | Done | Extended the dependency-free validator to check image and annotation files/hashes/dimensions, HTTPS provenance URLs, annotation type, rights status/date, and approval gates. `--require-complete` requires 16 approved cases; `--require-alpha-complete` additionally requires 16 soft-alpha mattes. CI run [#161](https://github.com/leenusdarnal/pixelcutout/actions/runs/45167116758) passed 67/67 tests, dependency audit, manifest validation, Svelte/TypeScript checks, and static build. No runtime dependency or image binary added. |

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
| P5-04 | Keep existing colour-removal tests and add edge cases | Tests cover tolerance, transparency, and reset behaviour | Done | Nine pixel-level colour-removal tests cover exact matches, tolerance boundaries/feathering, preserved foreground alpha/RGB, already-transparent pixels, tolerance clamping, and invalid input. The full-resolution worker wrapper now has five additional tests for encoded PNG output and API/error cleanup paths in `src/lib/workers/manual-processing.test.mjs`. Existing resource lifecycle tests cover worker termination and URL cleanup. |
| P5-05 | Make manual colour sampling keyboard accessible | Keyboard activation selects a predictable sample point | Done | Added `getBackgroundSamplePoint()` helper: pointer/touch maps to the exact displayed source pixel; keyboard activation samples the image centre. Four tests cover pointer scaling, edge clamping, keyboard sampling, and invalid bounds. Production build [READY](https://vercel.com/leenusdarnals-projects/pixelcutout/EjAwJHYEiaW7rp59P7g7Fn9yXgR9) for commit `4e5198f19a41476de35f80ae0e83adbc63223b6e`. |

### Phase 6 — QA, documentation, and release

| ID | Task | Acceptance check | Status | Notes / evidence |
|---|---|---|---|---|
| P6-01 | Run type checks, unit tests, and production build | All required CI checks pass | Done | GitHub Actions [run #154](https://github.com/leenusdarnal/pixelcutout/actions/runs/45161086484) passed with 61/61 tests, npm install, production dependency audit, benchmark validation, Svelte/TypeScript checks (0 errors, 0 warnings), and static production build. The run includes five full-resolution manual-worker processing/cleanup tests and a regression test for concise accessible image alternatives. |
| P6-02 | Test desktop and mobile, including constrained memory | No crash or unusable state on supported test devices | In progress | The refreshed production UI was inspected at desktop and 390×844 mobile viewport sizes. A synthetic 400×400 PNG uploaded successfully; the before/after control rendered, and pointer sampling selected the verified green pixel (`RGB 0,255,0`). Before the adapter-preflight fix, AI processing failed because `navigator.gpu` existed but `requestAdapter()` returned null; manual full-resolution processing was not conclusively verified in the automation browser. The post-fix AI rerun could not be completed in this session because the connected browser-testing service exhausted its daily credits. Real desktop and mid-range Android interaction and constrained-memory profiling remain outstanding. |
| P6-03 | Verify privacy claims with browser network inspection | No image pixels leave the browser | In progress | Source review and `src/privacy-contract.test.mjs` cover local Blob-to-worker handling, lazy AI import, and same-origin-only service-worker caching. In the synthetic browser run, the original and manual preview were represented by `blob:` URLs and the observed resource list contained same-origin app assets and the worker; no application upload endpoint or image-pixel request was observed. The AI backend failed before model loading, so model/runtime request timing and a complete post-fix network waterfall still need verification. |
| P6-04 | Verify PNG dimensions, alpha, and edge quality | Output meets benchmark acceptance criteria | Open | PNG encoder unit tests cover RGBA dimensions, alpha preservation, malformed frames, and cleanup. Visual edge/halo scoring on representative licensed fixtures remains pending; the benchmark manifest is intentionally empty until local fixtures are supplied. |
| P6-05 | Update README with workflow, limits, privacy, and model details | Documentation matches shipped behaviour | Done | README now matches the refreshed manual-removal labels, apply-at-full-resolution action, preview surfaces, and privacy flow. Added a link to `docs/UI_DESIGN_SYSTEM.md`; existing limits, model provenance, runtime fallback, and one-image scope remain documented. |
| P6-07 | Refresh the upload and editing workspace using the Refactoring UI design basis | One clear primary action, consistent visual system, responsive layout, accessible states, and no new runtime dependencies | Done | Implemented in PR #29 and merged at `cb08436325b5c32fd249cb39ce0423e20c07a273`; UI/CI validation passed in runs [#136](https://github.com/leenusdarnal/pixelcutout/actions/runs/45054718991) and [#137](https://github.com/leenusdarnal/pixelcutout/actions/runs/45054783222). Contrast and keyboard-focus follow-up was merged in PR #30; its regression tests passed in [run #140](https://github.com/leenusdarnal/pixelcutout/actions/runs/45055163115), followed by main validation run #141. No runtime dependency was added. |
| P6-06 | Deploy main release and verify; record Vercel quota issues separately | Current release is READY and the production alias serves the refreshed UI; quota failures are not mislabelled as app failures | Done | Main deployment `dpl_tw4kd1etdt2sYCAKQDTckPSsLv2U` for commit `6ce5bb0b97e0fd1b35bc362e018d9690f27a7a3f` reached READY on 2026-11-23 and is assigned the production aliases including `https://pixelcutout-three.vercel.app/`. GitHub Actions run [#148](https://github.com/leenusdarnal/pixelcutout/actions/runs/45146941610) passed all 55 tests, npm audit, benchmark validation, Svelte/TypeScript checks, and static build. End-to-end processing checks remain tracked separately in P6-02 to P6-04. |

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
| Transformers.js 4.3.2 does not fully honour pinned Hub revisions during model file discovery | Keep revision pinning disabled until a released runtime fix is verified against network requests for config, weights, and progress metadata | In progress |
| Large images exhaust mobile memory | Validate decoded dimensions/pixels; process with bounded buffers; test mobile | Open |
| WebGPU unavailable or unstable | Preflight `navigator.gpu.requestAdapter()` and choose WASM directly when no adapter is available; keep the tested fallback for other failures and update to the upstream chain-recovery fix when it is published | In progress |
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
| 2026-11-22 | Keep model provenance separate from model selection | Record Xenova/modnet Apache-2.0 metadata and observed commit SHA; defer runtime pin until Transformers.js revision propagation is fixed and verified |
| 2026-11-22 | Validate benchmark metadata in CI but keep source images local | Hashes and file paths are checked without committing fixture binaries or adding dependencies |
| 2026-11-23 | Preflight WebGPU adapter availability before inference | Live browser reported `navigator.gpu` present but `requestAdapter()` returned `null`; Transformers.js 4.3.2 then repeated the failed WebGPU error on its same-worker WASM fallback because its ONNX web initialization chain does not recover after rejection. Upstream [PR #1780](https://github.com/huggingface/transformers.js/pull/1780) merged on 2026-11-23; npm still serves 4.3.2, so PixelCutout uses a lightweight adapter preflight until a release includes the fix. |
| 2026-11-22 | Implement SvelteKit 3.4.0 and adapter-static 4.0.1 on an isolated maintenance branch | Preserve static hosting and browser-only processing; full npm audit is clean. PR #26 merged to main at c294b979; CI and Vercel preview passed. Protected-preview browser privacy and device checks remain open after merge |

## 10. Deferred / out of scope for first release

- Batch processing, queues, ZIP export.
- Accounts, cloud history, cloud storage, backend image processing.
- Brush editing, crop, background replacement, shadows, multi-format export.
- Multiple production models without benchmark justification.
- Analytics or telemetry that could collect image data.
- Unrelated framework upgrades or feature work bundled into the completed SvelteKit 3 maintenance change.

---

**Working rule:** complete and verify the smallest useful slice before starting the next. Update this tracker in the same change as implementation work; link PRs, commits, test output, and benchmark evidence in the Notes / evidence column.
