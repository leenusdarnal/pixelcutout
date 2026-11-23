# Benchmark manifest

This manifest tracks the local image fixtures described in [MODEL_BENCHMARK.md](../docs/MODEL_BENCHMARK.md). See the [16-case acquisition checklist](../docs/BENCHMARK_FIXTURE_ACQUISITION.md) before sourcing or approving any image. The committed manifest contains metadata only; source images and ground-truth masks are intentionally excluded from Git and the app build.

## Approved source path

Start with AIM-500 for natural images and soft alpha mattes. Read its [official release agreement](https://jizhizili.github.io/files/aim_dataset_agreement/AIM-500_Dataset_Release_Agreement.pdf) and follow the acquisition checklist. The agreement says the dataset is MIT-licensed but also says underlying image copyrights remain with original owners; verify each image's original licence and keep that evidence in the manifest.

Open Images V7 can fill a small number of difficult object cases only when its individual image licence is verified. Its instance masks are binary, not soft alpha; report those cases separately. Do not use non-commercial datasets or annotations for the commercial-use benchmark.

## Add a case

1. Read the dataset agreement and any access conditions.
2. Select an actual match for the assigned B01-B16 challenge. Do not fill a slot with a poor match.
3. Record the original image landing page, photographer/creator, exact image licence, licence URL, dataset agreement, annotation source and annotation licence. The image and its mask may have different rights owners.
4. Mark `license_status` as `approved` only after both image and annotation rights are verified. Keep unresolved items as `pending` and out of the approved set.
5. Put RGB inputs in `benchmarks/images/` and ground-truth mattes/masks in `benchmarks/masks/`; both folders are git-ignored.
6. Add a manifest entry with the existing validator fields plus the provenance fields below.
7. Run `npm run benchmark:validate`. When all 16 cases are populated, run `npm run benchmark:validate -- --require-complete`.

Example entry (illustrative only; replace every placeholder with verified source data):

```json
{
  "id": "B01",
  "filename": "b01-person-hair.png",
  "source": "AIM-500 v1.0",
  "creator": "Original photographer from source metadata",
  "license": "Exact image-specific licence",
  "sha256": "replace-with-64-character-file-digest",
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
  "annotation_license_url": "https://example.org/annotation-terms",
  "license_status": "pending",
  "rights_checked_on": null,
  "attribution": "Exact required attribution, if any",
  "notes": "Why this image meets B01 and known limitations"
}
```

The current validator enforces the original required metadata, local image existence, dimensions and SHA-256. It does **not yet** enforce the additional rights fields or verify mask files; keep those as explicit manual gates until the validator is extended. Use `annotation_type: "alpha"` for a soft matte and `"binary"` for a binary segmentation mask. Never pool their scores as equivalent measures.

Generate a digest locally with Node.js:

```sh
node --input-type=module -e "import {createHash} from 'node:crypto'; import {readFileSync} from 'node:fs'; console.log(createHash('sha256').update(readFileSync(process.argv[1])).digest('hex'))" benchmarks/images/person-hair.jpg
```

The validator uses only Node.js built-ins. It does not fetch URLs or upload images.
