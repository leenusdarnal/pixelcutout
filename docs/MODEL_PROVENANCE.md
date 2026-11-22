# AI model provenance and update procedure

**Status:** Current production baseline documented; runtime revision pin is deferred pending an upstream Transformers.js fix.  
**Last checked:** 2026-11-22

## Production model

| Field | Recorded value |
|---|---|
| Hugging Face model repository | [`Xenova/modnet`](https://huggingface.co/Xenova/modnet) |
| Observed repository commit | [`fa2fa546052fba4c08921230a26cc69a333fca12`](https://huggingface.co/Xenova/modnet/commit/fa2fa546052fba4c08921230a26cc69a333fca12) |
| Commit observation | Hugging Face Hub metadata read on 2026-11-22; repository last-modified timestamp reported as 2025-10-26 |
| Model-card licence | Apache-2.0 (`apache-2.0`) |
| Model-card task/tags | `image-segmentation`, `background-removal`, `portrait-matting` |
| Runtime package | `@huggingface/transformers` 4.3.2 (exact version in `package.json`) |
| WebGPU model dtype | `q4f16`, served from `onnx/model_q4f16.onnx` |
| WASM model dtype | `uint8`, served from `onnx/model_uint8.onnx` |

The recorded commit is the Hub's observed current HEAD, **not** a claim that the production application currently loads that exact commit. PixelCutout currently passes the model repository ID without a `revision` option, so the Hub's default `main` revision is used. The model card describes MODNet as portrait matting; performance on pets, products, transparent objects, fine structures, and complex scenes is not established by that description and must be benchmarked.

## Why the runtime revision is not pinned yet

Transformers.js 4.3.2 accepts a `revision` option for pretrained models, but its `pipeline()` file-discovery/progress-metadata path does not consistently pass that option to all Hub metadata requests. In particular, config and file metadata can still be requested from `resolve/main/` while model weights are requested from the supplied commit. That undermines a claim that the full model load is reproducibly pinned and can cause an avoidable request/cache mismatch.

- Upstream issue: [huggingface/transformers.js#1893](https://github.com/huggingface/transformers.js/issues/1893), opened 2026-11-08.
- Related upstream fix proposal: [huggingface/transformers.js#1942](https://github.com/huggingface/transformers.js/pull/1942). Checked 2026-11-22; the PR was closed without being merged.
- PixelCutout decision: do not add a `revision` argument until a published Transformers.js release fixes the discovery path and a browser network test proves all model/config/progress requests resolve to the same immutable commit.

This is a reproducibility limitation, not a reason to change the model automatically. Keep the current baseline until a fix and the benchmark data justify a change.

## Model update procedure

1. **Inspect the Hub entry.** Read the model card, declared licence, repository file list, task tags, and current full commit SHA. Do not rely on a repository name or a short SHA alone.
2. **Review rights.** Confirm the model card's licence and any relevant upstream notices. Record the checked date and exact source links here.
3. **Review the runtime.** Confirm the installed Transformers.js version supports revision pinning through both model loading and file discovery. Read its changelog and relevant upstream issues; do not assume an API parameter is fully propagated.
4. **Pin only after a network regression test.** Set `revision` to a 40-character commit SHA in the worker. Capture a clean browser network trace and verify configuration, model weights, processor/tokenizer metadata (if any), and progress-size requests use that exact SHA. Confirm there are no unintended `resolve/main/` model requests.
5. **Benchmark before switching.** Run the same local 16-case set and device/runtime protocol in [`MODEL_BENCHMARK.md`](MODEL_BENCHMARK.md). Record download bytes, cold start, warm median, memory, WebGPU/WASM support, visual scores, and licence.
6. **Update atomically.** Update the worker model ID/revision, this provenance file, the benchmark scorecard, README limitations, and `docs/PROJECT_TRACKER.md` in the same reviewed change. Keep the package version exact and the lockfile consistent.
7. **Keep assets out of the app bundle.** Do not commit model binaries or benchmark images to `static/`, `public/`, or application source. Model assets remain remote and load only after the user's explicit AI action.

## Release checks

- [ ] Current production model ID, commit SHA, licence, and runtime version are recorded.
- [ ] Runtime uses the recorded immutable revision only after the revision-propagation fix is verified.
- [ ] Browser network trace shows model and metadata requests are all revision-consistent.
- [ ] Benchmark scores and desktop/mobile performance justify the chosen model.
- [ ] Model assets remain lazy-loaded and user image pixels remain local.
