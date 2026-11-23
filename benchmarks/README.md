# Benchmark fixtures

The committed \`manifest.json\` tracks individually provenance-checked custom fixtures. Source images and ground-truth masks are intentionally excluded from Git and the app build. AIM-500 acquisition uses a separate local candidate report because the mirror does not provide original per-photo landing-page/licence URLs.

## Primary real-photo source: AIM-500

AIM-500 is released by the authors as a 500-image natural-image matting test set with manually labelled alpha mattes. The official release agreement states that the Dataset is under the MIT licence, the images were collected from websites with free-use licences, and copyright in the photographs remains with the original owners. It asks research documents/papers using the Dataset to cite the IJCAI 2021 work and includes an indemnification clause.

PixelCutout's acquisition tool follows those terms:
- It resolves the Hugging Face \`refs/convert/parquet\` snapshot to a full immutable commit SHA before loading the data, then records that exact SHA in the report and citation file rather than loading floating \`main\`.
- It copies the upstream AIM repository MIT notice, including \`Copyright (c) 2021 Jizhizi_Li\`, into \`LICENSE-AIM-500.txt\`.
- It writes the required IJCAI 2021 reference into \`CITATION-AIM-500.txt\`.
- It records the agreement, original-photo copyright statement, source metadata limitation, item IDs, dimensions, and separate SHA-256 hashes in \`aim500-candidates.json\`.
- It stores RGB and alpha PNGs under ignored \`benchmarks/results/aim500/\`; the workflow uploads metadata only, never image or matte binaries.

Read and agree to the [official AIM-500 Dataset v1.0 Release Agreement](https://jizhizili.github.io/files/aim_dataset_agreement/AIM-500_Dataset_Release_Agreement.pdf) before acquisition. Keep the upstream MIT notice with any copy or substantial portion of the dataset, and cite Li, Zhang & Tao (IJCAI 2021) in research documents/papers that use it.

**Photo copyright remains with the original owners.** The mirror does not give PixelCutout per-photo original landing pages or individual licence URLs. The project therefore uses the acquired files only for local model evaluation and does not redistribute raw photos/mattes, commit them, upload them as workflow artifacts, or include them in the deployed app. The MIT notice is not a transfer of photographer copyright. Before external redistribution or independent reuse of any photograph, trace its original source and comply with the source owner's licence and attribution conditions.

## Acquire AIM-500 locally

Install the optional local-only dependencies and run:

\`\`\`sh
python -m pip install -r benchmarks/requirements.txt
python benchmarks/acquire_aim500.py
\`\`\`

The generator selects 16 deterministic candidates across all seven categories and prefers a mix of \`SO\`, \`STM\`, and \`NS\` types. It writes lossless RGB PNGs, 8-bit grayscale alpha PNGs, a metadata report, the MIT notice, and the citation to \`benchmarks/results/aim500/\`. The \`mask.convert("L")\` operation is used because the mirror's documented integrity check found that its RGB/RGBA matte modes contain replicated grayscale channels and opaque RGBA alpha; conversion preserves the matte values.

The 16 rows are category-balanced candidates, not yet manually assigned to all 16 visual challenge labels. Inspect them before claiming a given sample represents hair, thin mesh, lace, backlighting, or another specific edge case. Keep raw images and model outputs under ignored local directories.

## Local storage and privacy

- AIM-500 candidate files: \`benchmarks/results/aim500/images/\` and \`benchmarks/results/aim500/masks/\`.
- Project-owned synthetic smoke files: \`benchmarks/results/synthetic-v1/images/\` and \`benchmarks/results/synthetic-v1/masks/\`.
- Both generated result sets and raw results are under the git-ignored \`benchmarks/results/\` folder.
- Never copy these image/matte files into \`static/\`, \`public/\`, an app-imported source directory, or Git.
- Do not upload image or mask pixels to any remote service.
- Keep synthetic scores separate from AIM-500 natural-photo scores.

## Project-owned synthetic smoke set

For a deterministic 16-case set with exact procedurally generated alpha mattes, see [the synthetic benchmark guide](../docs/SYNTHETIC_BENCHMARK.md). Generate it locally with:

\`\`\`sh
python -m pip install "Pillow>=10,<13"
python benchmarks/generate_synthetic.py
\`\`\`

This suite is useful for pipeline checks and controlled synthetic regression tests. It is not a photorealistic benchmark and must not be pooled with AIM-500 natural-photo metrics or used alone to choose the production model.

## Individually approved custom fixtures

For any additional image added to the committed \`manifest.json\`, record its exact source landing page, creator/photographer, image-specific licence and URL, annotation source/licence, agreement terms, attribution, dimensions, and SHA-256 hashes. Do not invent a provenance value when it is missing. Keep the photograph and annotation rights distinct; the annotation may have a different rights holder from the photograph.

The dependency-free validator checks local file paths, hashes, dimensions, HTTPS provenance URLs, annotation type, and approval metadata. Use \`npm run benchmark:validate\` for structural checks; \`--require-complete\` and \`--require-alpha-complete\` are gates for the separately maintained 16-case individually approved fixture manifest, not for the AIM-500 local candidate report.

Use \`annotation_type: "alpha"\` for a soft foreground-opacity matte and \`"binary"\` for a binary segmentation mask. Never pool binary-mask scores with soft-alpha matting metrics.
