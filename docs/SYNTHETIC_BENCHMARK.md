# Project-owned synthetic benchmark

**Status:** A deterministic 16-case suite is available for pipeline checks and controlled regression tests. It is not a photorealistic benchmark and does not complete the real-photo quality gate.

## Why this suite exists

AIM-500 remains a useful natural-image matting candidate, but the repository's current mirror does not provide enough per-photograph provenance to approve its selected images. Rather than infer ownership from a dataset-level licence, PixelCutout now has a separate benchmark suite generated entirely from project-authored code.

The generator draws scenes and foreground shapes with Pillow primitives. It then composites the foreground over a generated background using the exact grayscale alpha image saved as the ground truth. The resulting source PNGs and alpha PNGs are reproducible and have no third-party image inputs.

## Generate locally

Install only the small image-generation dependency:

\`\`\`sh
python -m pip install "Pillow>=10,<13"
python benchmarks/generate_synthetic.py
\`\`\`

The generator writes to \`benchmarks/results/synthetic-v1/\` by default:

\`\`\`text
benchmarks/results/synthetic-v1/
  images/          # 16 generated RGB source scenes
  masks/           # 16 matching 8-bit grayscale alpha mattes
  manifest.json    # hashes, dimensions, challenge labels, provenance
\`\`\`

These result folders are ignored by Git. The generator does not access the network, modify application assets, or approve any AIM-500 fixture.

Run its regression tests with:

\`\`\`sh
python -m unittest discover -s benchmarks -p 'test_*.py' -v
\`\`\`

The test suite verifies all 16 pairs, dimensions and modes, matte edge values, the glass case's partial opacity, file hashes, project-owned provenance metadata, and deterministic output.

## Included challenges

| Case | Synthetic challenge |
|---|---|
| B01 | Portrait silhouette with straight hair strands |
| B02 | Curly hair and flyaways |
| B03 | Full-body figure, clothing straps, and gaps |
| B04 | Irregular long-fur animal edge |
| B05 | Dark animal against a dark scene |
| B06 | Pale animal against a bright scene |
| B07 | Product shape with a background cast shadow |
| B08 | Dark mug with an open handle |
| B09 | Glass bottle with partial foreground opacity |
| B10 | Scissors with narrow blades and handle openings |
| B11 | Overlapping plant leaves and thin stems |
| B12 | Open wire basket and thin crossing lines |
| B13 | Lace-like panel with holes |
| B14 | Feather shaft and fine barbs |
| B15 | Textured leaf against a similar-colour background |
| B16 | Overlapping fruit against a busy scene |

All outputs are 512×512 RGB inputs paired with 512×512 8-bit alpha mattes. B09 deliberately caps the foreground opacity at approximately 48%; its matte is not meant to be binary.

## How to use the suite

Use the same generated source files for every model and runtime. Keep the generated \`manifest.json\` with local measurements so each result can be traced to the input and matte hashes. Inspect alpha edges visually as well as numerically; exact synthetic ground truth is especially useful for testing metric implementations and catching regressions in the benchmark pipeline.

Do not present these scenes as natural photographs. Their geometry, textures, and material appearance are procedural illustrations, so they cannot establish real-world performance on photography, complex hair, animal fur, skin, glass, or commercial product imagery. Do not combine these results with AIM-500 or other real-photo scores, and do not select the production model from synthetic results alone.

## Score a local model output

After generating predictions named `B01.png` through `B16.png` in a local `predictions/` folder, score them against the exact alpha mattes:

```sh
python benchmarks/evaluate_alpha.py \
  --manifest benchmarks/results/synthetic-v1/manifest.json \
  --predictions benchmarks/results/synthetic-v1/predictions \
  --output benchmarks/results/synthetic-v1/scores.json
```

The scorer reads the original 8-bit mattes for MAE, SAD/1000, and MSE, and separately reports thresholded IoU/F1 and boundary F1 (default threshold 128, tolerance 2 pixels). It requires matching dimensions, checks matte hashes from the manifest, supports grayscale or RGBA predictions, and keeps all pixels and scorecards local. See [the benchmark fixture guide](../benchmarks/README.md#score-local-alpha-predictions) for the AIM-500 command and metric definitions.

A perfect score on these procedurally generated illustrations verifies the scoring pipeline; it does not demonstrate natural-photo model quality.

## Rights and privacy

The generator contains no network client and loads no external image. The output pixels are drawn from project-authored code and are labelled \`project-owned\` in the generated manifest. Keep generated PNGs and raw score files under ignored \`benchmarks/results/\`; do not commit them, put them under \`static/\` or \`public/\`, or send them to a remote service.

The AIM-500 rights review remains separate. Its candidate photos stay pending until each underlying photograph and its annotation have independently traceable rights.
