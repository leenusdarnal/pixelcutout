# Benchmark manifest

This manifest tracks the local image fixtures described in [MODEL_BENCHMARK.md](../docs/MODEL_BENCHMARK.md). See the [16-case acquisition checklist](../docs/BENCHMARK_FIXTURE_ACQUISITION.md) before sourcing or approving any image. The committed manifest contains metadata only; source images and ground-truth masks are intentionally excluded from Git and the app build.

## Approved source path

Start with AIM-500 for natural images and soft alpha mattes. Read its [official release agreement](https://jizhizili.github.io/files/aim_dataset_agreement/AIM-500_Dataset_Release_Agreement.pdf) and follow the acquisition checklist. The agreement says the dataset is MIT-licensed but also says underlying image copyrights remain with original owners; verify each image's original licence and keep that evidence in the manifest.

Open Images V7 can fill a small number of difficult object cases only when its individual image licence is verified. Its instance masks are binary, not soft alpha; report those cases separately. Do not use non-commercial datasets or annotations for the commercial-use benchmark.

## Local storage

- Put RGB source images in `benchmarks/images/`.
- Put the matching ground-truth alpha mattes or binary masks in `benchmarks/masks/`.
- Both folders, plus `benchmarks/results/`, are git-ignored. Never copy these files to `static/`, `public/`, or an app-imported source directory.
- Do not upload image or mask pixels to a remote service.

## Add a case

1. Read the dataset agreement and any access conditions.
2. Select an actual match for the assigned B01-B16 challenge. Do not fill a slot with a poor match.
3. Record the original image landing page, photographer/creator, exact image licence, licence URL, dataset agreement, annotation source and annotation licence. The image and its mask may have different rights owners.
4. Mark `license_status` as `approved` only after both image and annotation rights are verified. Keep unresolved items as `pending`; do not count them as complete. Use `excluded` for items rejected after review.
5. Record a separate SHA-256 and dimensions for the image and its annotation. The alpha/binary annotation must have the same dimensions as the source image.
6. Run `npm run benchmark:validate` for structural, provenance, path and hash checks. When all 16 cases are rights-approved, run `npm run benchmark:validate -- --require-complete`. For the primary soft-alpha matting scorecard, run `npm run benchmark:validate -- --require-alpha-complete`.

Example entry (illustrative only; replace every placeholder with verified source data):

```json
{
  "id": "B01",
  "filename": "b01-person-hair.png",
  "source": "AIM-500 v1.0",
  "creator": "Original photographer from source metadata",
  "license": "Exact image-specific licence",
  "sha256": "64-character lowercase image SHA-256",
  "width": 1920,
  "height": 1080,
  "dataset_name": "AIM-500",
  "dataset_version": "v1.0",
  "dataset_item_id": "exact upstream image ID or filename",
  "source_landing_url": "https://original-image-page.example/",
  "image_license_url": "https://creativecommons.org/licenses/by/4.0/",
  "dataset_agreement_url": "https://jizhizili.github.io/files/aim_dataset_agreement/AIM-500_Dataset_Release_Agreement.pdf",
  "annotation_filename": "b01-person-hair-alpha.png",
  "annotation_type": "alpha",
  "annotation_license": "Exact annotation licence",
  "annotation_license_url": "https://annotation-source.example/terms",
  "annotation_sha256": "64-character lowercase annotation SHA-256",
  "annotation_width": 1920,
  "annotation_height": 1080,
  "license_status": "pending",
  "rights_checked_on": null,
  "attribution": "Exact required attribution, or explicitly state none is required",
  "notes": "Why this image meets B01 and known limitations"
}
```

The validator requires the image and annotation provenance fields, verifies all HTTPS source/licence/agreement links, checks both local files and SHA-256 digests, and rejects path traversal or dimension mismatches. A `pending` record is allowed during local review, but `--require-complete` requires all 16 IDs and `license_status: "approved"`; `--require-alpha-complete` additionally requires all 16 annotations to be soft alpha mattes. `rights_checked_on` must be a real `YYYY-MM-DD` date for approved items and `null` for pending items.

Use `annotation_type: "alpha"` for a soft foreground-opacity matte and `"binary"` for a binary segmentation mask. Never pool binary-mask scores with soft-alpha matting metrics.

Generate a digest locally with Node.js:

```sh
node --input-type=module -e "import {createHash} from 'node:crypto'; import {readFileSync} from 'node:fs'; console.log(createHash('sha256').update(readFileSync(process.argv[1])).digest('hex'))" benchmarks/images/person-hair.jpg
```

The validator uses only Node.js built-ins. It does not fetch URLs or upload images.

## Acquire a local AIM-500 candidate set

The local acquisition tool selects 16 reproducible candidates across the seven AIM-500 categories, preferring a mix of `SO`, `STM`, and `NS` types. It downloads the dataset through Hugging Face Datasets, writes decoded RGB images as lossless PNG and alpha mattes as 8-bit grayscale PNG, and creates `benchmarks/results/aim500/aim500-candidates.json` with dimensions and SHA-256 hashes.

Install the optional local-only dependencies and run:

```sh
python -m pip install -r benchmarks/requirements.txt
python benchmarks/acquire_aim500.py
```

This is a candidate-set acquisition step, not rights clearance. The generated report explicitly keeps every item `pending`; it does not populate `manifest.json`, because the mirrored rows do not provide per-photo source/licence evidence. Verify each original photograph and the annotation terms before manually registering an approved fixture. The downloaded pixels and report remain under ignored `benchmarks/results/`; never commit them or upload them to a service.
