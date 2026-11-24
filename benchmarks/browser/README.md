# Local browser model benchmark

This is a **separate, local-only benchmark harness**. It is not part of the PixelCutout production route or production app bundle.

## Start

From the repository root:

```sh
npm ci
npm run benchmark:browser:dev
```

Open the local URL printed by Vite (normally `http://localhost:4174`). Use a recent Chromium browser for WebGPU and the local output-folder picker. WASM is available as a CPU comparison where the browser supports the required Transformers.js operations.

## Hosted preview

The same harness is available from the Vercel Benchmarks project at
[benchmarks-git-main-leenusdarnals-projects.vercel.app](https://benchmarks-git-main-leenusdarnals-projects.vercel.app/).
The deployment is protected by the owning Vercel team's SSO. Sign in with the
team account before opening it. The hosted page still reads the fixture folder
from the device you select; it does not store or upload the photos, mattes, or
predictions.

## Fixture folder

Choose the local directory created by the terms-gated AIM-500 acquisition:

`benchmarks/results/aim500/`

When the browser cannot select a directory, use the **Or select the fixture files individually** picker and select `aim500-candidates.json` plus all 32 PNG files from its `images/` and `masks/` folders in one multi-file selection. The harness matches unique file names from the manifest and rejects duplicate names or missing pairs.

It must contain:

- `aim500-candidates.json`
- `images/` with the 16 RGB PNGs
- `masks/` with the corresponding grayscale alpha PNGs

The raw fixture package is intentionally ignored by Git. Read and accept the official AIM-500 release agreement before acquiring it. The browser harness does not download the dataset and does not send photos or mattes anywhere.

## Run a comparison

Select WebGPU or WASM, keep both model checkboxes selected, choose an output folder, and start the run. Models are loaded and evaluated sequentially in separate workers to limit memory and isolate runtime failures. The harness warms each model once, then processes the same 16 source files in order.

- **MODNet:** `Xenova/modnet`; Q4F16 on WebGPU and UINT8 on WASM.
- **BiRefNet Lite 512:** `studioludens/birefnet-lite-512`; FP16 on WebGPU and FP32 on WASM. This model downloads substantially more data than MODNet.
- The model asset byte count is the total reported by Transformers.js progress callbacks. It can include cached files and is **not** a measured network-transfer total. Network transfer must be verified separately with the browser's Network panel.
- Model revision metadata records a previously observed Hub commit, but the runtime does not pin it. Do not treat the run as immutable model-revision reproduction; see `docs/MODEL_PROVENANCE.md`.
- Peak GPU/WASM memory is not consistently exposed by browser APIs. The scorecard records device hints, not a fabricated memory measurement; profile memory separately on real desktop and Android devices.

Predicted PNGs store the matte in the PNG alpha channel. The JSON metadata and predictions are saved into the selected folder under a model/backend-specific directory. When the browser cannot write to a chosen folder, it offers individual PNG downloads instead.

## Score alpha quality locally

After saving predictions, run the scorer from the repository root:

```sh
python benchmarks/evaluate_alpha.py \
  --manifest benchmarks/results/aim500/aim500-candidates.json \
  --ground-truth benchmarks/results/aim500/masks \
  --predictions /path/to/output/MODNet-webgpu/predictions \
  --output /path/to/output/MODNet-webgpu/scorecard.json
```

Repeat with the BiRefNet Lite prediction directory. Keep the scorecards separate by model and backend. The scorer requires actual intermediate alpha values in the ground truth and checks the ground-truth hashes and dimensions. Do not combine synthetic-suite results with AIM-500 natural-photo results. It also verifies every source-image SHA-256 against the local `images/` fixture folder and records both verified input hashes in each case result.

Compare scorecards only after all candidates have been scored against the same fixture set and thresholds:

```sh
npm run benchmark:compare:alpha -- \
  --candidate MODNet-WASM=/path/to/output/MODNet-WASM/scorecard.json \
  --candidate BiRefNet-WASM=/path/to/output/BiRefNet-WASM/scorecard.json \
  --output /path/to/output/matched-comparison.json
```

The comparator rejects differences in case IDs, source-image hashes, ground-truth alpha hashes, filenames, dimensions, or metric thresholds. Its report includes per-case metrics and macro/pixel-weighted winners. It compares only the supplied local JSON files; no image pixels or scorecards are uploaded. Do not combine synthetic-suite results with AIM-500 natural-photo results.

## Build check

```sh
npm run benchmark:browser:build
```

The output is written to the ignored `benchmarks/browser/dist/` directory and does not enter the normal Vite/SvelteKit production build.

## Privacy and rights

Source images and masks are read from local files selected by the user. Predictions are created in a browser worker and written to a local folder or downloaded by the browser. The only external requests are model/runtime asset requests needed for inference. The harness has no application upload endpoint. AIM-500 photograph copyright remains with the original photo owners; keep this benchmark subset local and do not redistribute it.
