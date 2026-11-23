# Model benchmark fixture acquisition plan

**Status:** A 16-case local AIM-500 acquisition path is implemented. It pins the mirror snapshot, includes the upstream MIT notice and paper citation, and keeps all source pixels local. No image binaries are committed or uploaded.  
**Goal:** Acquire a small, traceable 16-image set for comparing MODNet with general-purpose alternatives on identical inputs.  
**Storage rule:** Source images and ground-truth masks stay local in ignored benchmark folders. Never place them in `static/`, `public/`, app source, Git, or deployment artifacts.

## 1. Recommended source order

### Primary source: AIM-500

- Official project and download instructions: [JizhiziLi/AIM](https://github.com/JizhiziLi/AIM).
- Official download folder: [AIM-500 on Google Drive](https://drive.google.com/drive/folders/1IyPiYJUp-KtOoa-Hsm922VU3aCcidjjz?usp=sharing).
- Required release terms: [AIM-500 Dataset v1.0 Release Agreement](https://jizhizili.github.io/files/aim_dataset_agreement/AIM-500_Dataset_Release_Agreement.pdf).
- Research paper: [Deep Automatic Natural Image Matting, IJCAI 2021](https://doi.org/10.24963/ijcai.2021/111).
- Optional indexed mirror for inspection: [nobg/AIM-500 on Hugging Face](https://huggingface.co/datasets/nobg/AIM-500). Prefer the official author release for acquisition and record whether a mirror was used.

AIM-500 is the primary real-photo source for this comparison: the authors describe 500 high-resolution images across seven categories—100 portraits, 200 animals, 34 transparent objects, 75 plants, 45 furniture items, 36 toys, and 10 fruit images—with manually labelled alpha mattes. It includes salient-opaque, salient-transparent/meticulous, and non-salient image types. The official release agreement states that the Dataset is under the MIT license, that the images were collected from websites with free-use licences, and that copyright in the photographs remains with the original owners. It also asks research documents and papers using the Dataset to cite the IJCAI 2021 paper and includes an indemnification clause.

**MIT compliance for PixelCutout:** The acquisition script copies the upstream MIT `LICENSE` text (including `Copyright (c) 2021 Jizhizi_Li`) into `LICENSE-AIM-500.txt` beside the local images and masks, and writes the required paper reference to `CITATION-AIM-500.txt`. It records the exact upstream project, release-agreement URL, and pinned mirror revision in the JSON report. Keep these notices with any local copy or substantial portion of the dataset.

The Hugging Face Datasets 4.x loader uses its exported-Parquet path for the default `main` branch and disables that path when a custom `revision=` is passed. PixelCutout therefore avoids overriding `revision` for `load_dataset`; instead, it captures both branch SHAs before/after loading and refuses to write candidate files if either moved. The loader itself resolves and pins the Parquet branch SHA while constructing the dataset.

**Photo copyright boundary:** The agreement expressly says image copyright belongs to original owners. The Hugging Face mirror used by the script does not provide per-photo source landing pages or individual licence URLs; its dataset card says it mirrors the original image and mask bytes and omits derived `trimap/` and `usr/` folders. Therefore this PixelCutout workflow is deliberately limited to local model evaluation: source images and masks remain in ignored folders and are never uploaded to GitHub artifacts or the app. Do not republish raw photos/mattes, create a public image gallery, or reuse an individual photo independently without checking its original owner/source terms and any attribution requirements. The MIT notice does not transfer the photographers' copyright to PixelCutout.

### Supplement for exact edge cases: Open Images V7

- Official overview and downloads: [Open Images V7](https://storage.googleapis.com/openimages/web/download_v7.html).
- Official license and dataset facts: [Open Images V7 facts and figures](https://storage.googleapis.com/openimages/web/factsfigures_v7.html).

Open Images V7 supplies instance-segmentation masks for a large set of object instances. The published masks are **binary PNG masks**, not soft alpha mattes. Google states that annotations are CC BY 4.0 and that images are listed as CC BY 2.0, but explicitly says it makes no representation or warranty about the licence status of each image and that users must verify each image. Its image metadata includes the original landing URL, licence URL, author, and title.

Use it only for a clearly separated binary-mask extension (for example, bicycle spokes or cluttered multi-object scenes) and only after checking the exact image's metadata and original landing page. Do not combine binary-mask scores with AIM-500 soft-alpha scores as though they measure the same task. Keep this source as a fallback, not a reason to delay the first alpha-matting comparison.

## 2. 16-case acquisition checklist

Select the best matching image from AIM-500 first. The dataset categories are broad; the specific visual challenge in each row is **not guaranteed** to exist. Inspect candidates before assigning an ID. If no item genuinely matches, keep the case open and obtain an owned/commissioned image with a documented alpha matte, or use the separately labelled Open Images binary extension where stated.

| Case | Required challenge | First choice and selection guidance | Ground truth / acquisition decision |
|---|---|---|---|
| B01 | Person with straight/dark hair against a dark or detailed background | AIM-500 portrait subset; inspect hair/background contrast before selecting | Soft alpha from AIM-500; require a true match, not just any portrait |
| B02 | Curly/coiled hair, flyaways, or backlighting | AIM-500 portrait subset; inspect the transition edge at full resolution | Soft alpha from AIM-500; otherwise acquire an owned portrait and commission/create a reviewed matte |
| B03 | Full-body person with loose clothing, straps, or visible gaps | AIM-500 portrait subset; favour full-body poses and visible negative spaces | Soft alpha from AIM-500; do not infer gaps from a bounding box |
| B04 | Long-haired animal with varied fur | AIM-500 animal subset; inspect fur detail and subject completeness | Soft alpha from AIM-500 |
| B05 | Dark animal against a dark/low-contrast background | AIM-500 animal subset; select an actual low-contrast example | Soft alpha from AIM-500; record the image-specific difficulty |
| B06 | White/light animal against a bright background | AIM-500 animal subset; select pale fur/ear detail against a bright scene | Soft alpha from AIM-500 |
| B07 | Product-like object on a clean light background with a cast shadow | AIM-500 toy, fruit, or furniture subset only if the actual photo contains the required clean setup and shadow; otherwise use a self-owned/commissioned product photo | Prefer reviewed soft alpha. Do not label a fruit/toy as a commercial product unless that is the actual subject |
| B08 | Dark product/object against a dark or similarly coloured surface | AIM-500 toy/furniture subset if a genuine low-contrast example exists; otherwise use a self-owned/commissioned photograph | Prefer reviewed soft alpha; record the exact subject and contrast |
| B09 | Transparent or reflective object | AIM-500 transparent subset; choose an actual transparent/meticulous sample | Soft alpha from AIM-500; preserve original mask values without binarising |
| B10 | Irregular household object with handles, holes, or thin parts | AIM-500 furniture/toy subset; inspect for holes and connected parts | Soft alpha from AIM-500; use Open Images only as a separate binary extension if no suitable alpha case exists |
| B11 | Plant with overlapping leaves and thin stems | AIM-500 plant subset; choose a dense plant rather than a simple isolated leaf | Soft alpha from AIM-500 |
| B12 | Thin structures such as bicycle spokes, mesh, or wire | First inspect AIM-500 furniture/transparent subsets; if no genuine example exists, use a rights-verified Open Images V7 bicycle/mesh instance | AIM-500 alpha if available; Open Images provides binary masks only and must be reported separately |
| B13 | Lace, netting, or patterned fabric with open weave | AIM-500 transparent/meticulous subset; verify that the subject actually has an open weave | Soft alpha from AIM-500 if matched; otherwise acquire an owned/commissioned sample and obtain a reviewed alpha matte |
| B14 | Small branches, feathers, or similarly delicate natural detail | AIM-500 plant/animal subset; select the actual branch/feather detail if present | Soft alpha from AIM-500; otherwise a rights-verified Open Images binary case is extension-only |
| B15 | Subject and background share similar colours or texture | AIM-500 non-salient (NS) examples; select a case where the foreground is genuinely difficult to distinguish | Soft alpha from AIM-500; record why it is non-salient/low contrast |
| B16 | Overlapping subjects or a busy/cluttered scene | AIM-500 NS examples if a suitable multi-object case exists; otherwise use an Open Images V7 image with multiple instance masks and explicitly select the target instance(s) | Prefer AIM-500 alpha. Open Images is binary-mask extension-only; record target instance IDs |

**Selection rule:** Do not fill a row just to reach 16. Keep it unfilled until a source image genuinely meets the challenge. The generated PixelCutout contact sheet is suitable for pipeline smoke tests only; it has no ground-truth alpha and must not be used for quantitative model scoring.

## 3. Sources to exclude from the commercial benchmark unless terms change

| Dataset | Why it is not in the approved acquisition path |
|---|---|
| [PPM-100](https://github.com/ZHKKKe/PPM) | The authors state that the annotated alpha mattes are CC BY-NC-SA 4.0. That restriction is incompatible with using those masks in a commercial product benchmark. The original Flickr photos have their own licence terms; the photo and matte rights must not be conflated. |
| [DIS5K](https://huggingface.co/datasets/nobg/DIS5K) | Its terms of use explicitly limit the dataset to non-commercial research/education and prohibit commercial use without permission. |
| [DUTS](https://huggingface.co/datasets/nobg/DUTS) | The source describes academic/research use; the mirror lists CC BY-NC 4.0 and no author-provided SPDX licence. Do not use for a commercial benchmark without written permission. |
| [Adobe Deep Image Matting Dataset](https://github.com/adobe-research/Deep_Image_Matting_Dataset) | Its dataset licence agreement prohibits commercial use and permits non-commercial research. |
| [AM-2k / BG-20k](https://github.com/99991/animal-matting) | The project requests research-purpose use and asks users to contact the authors for a commercial-use licence. |
| [Alpha Matting Evaluation Dataset](https://www.alphamatting.com/datasets.php) | The page exposes training inputs and public alpha mattes, but the dataset page does not state an image-use licence. The eight-image test set has hidden alpha ground truth. Do not import until usage rights are clarified; it can be considered for visual research only after permission is confirmed. |
| [SA-1B](https://ai.meta.com/datasets/segment-anything/) | The data card describes research-purpose use and a limited licence. Do not assume commercial evaluation rights. |

[COCO](https://cocodataset.org/#termsofuse) is not the first choice for this task: COCO's annotations are CC BY 4.0, but the consortium says it does not own the photographs and that image use is subject to Flickr terms. Only use an individual image if its original licence is independently verified.

## 4. Rights and provenance checklist for every image

Before acquiring or using an AIM-500 case in this local benchmark:

- [ ] Read and agree to the official AIM-500 v1.0 release agreement before downloading.
- [ ] Preserve the upstream MIT copyright and permission notice (`Copyright (c) 2021 Jizhizi_Li`) in `LICENSE-AIM-500.txt`.
- [ ] Preserve the required IJCAI 2021 citation in `CITATION-AIM-500.txt` and in any published research document/paper that uses the dataset.
- [ ] Record exact dataset ID, image filename, category/type, pinned dataset revision, and SHA-256 for both image and alpha matte.
- [ ] Record the agreement's statement that source photographs were collected from websites with free-use licences and that their copyright remains with original owners.
- [ ] Do not invent a photographer, image landing-page URL, or individual licence URL when the mirror does not provide it; record that provenance gap explicitly.
- [ ] Keep images and mattes under ignored local benchmark directories; do not commit, upload as workflow artifacts, bundle in the app, or expose through a public gallery.
- [ ] Before any external redistribution or independent reuse of an individual photograph, locate the original source and comply with that owner's licence and attribution terms.

## 5. Local-only folder layout

Keep source data outside app source and deployment inputs:

```text
benchmarks/
  images/          # local-only RGB inputs (git-ignored)
  masks/           # local-only alpha/binary ground truth (git-ignored)
  manifest.json    # metadata only; safe to commit after rights review
  results/         # optional local-only output images/score files (git-ignored)
```

Do not commit dataset archives, source images, masks, model outputs, or raw pixels. Commit only metadata, documentation, and aggregate scores that can be shared under the applicable terms. The benchmark must not send any image or mask pixels to a remote service.

## 6. Manifest metadata

Populate the validator's source fields, independent annotation fields, and rights evidence. The validator checks both local pixel files and the metadata below; do not register a case with invented source or licence data:

```json
{
  "id": "B01",
  "filename": "b01-person-hair.png",
  "source": "AIM-500 v1.0",
  "creator": "Original photographer; use exact source metadata",
  "license": "Image-specific licence; include the exact name",
  "sha256": "64-character lowercase SHA-256",
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
  "annotation_license": "Record the exact annotation licence",
  "annotation_license_url": "https://annotation-source.example/terms",
  "annotation_sha256": "64-character lowercase annotation SHA-256",
  "annotation_width": 1920,
  "annotation_height": 1080,
  "license_status": "pending",
  "rights_checked_on": null,
  "attribution": "Exact required attribution, if any",
  "notes": "Why this image satisfies B01; any known limitations"
}
```

Allowed `annotation_type` values: `alpha` for a soft foreground-opacity matte, or `binary` for an object segmentation mask. Allowed `license_status` values: `pending`, `approved`, or `excluded`. The validator verifies image and annotation files, hashes, dimensions, and HTTPS provenance URLs. `--require-complete` requires all 16 IDs and approved rights status; `--require-alpha-complete` also requires all annotations to be alpha mattes. Only approved records may be included in the commercial-use benchmark. Do not put fabricated creator names, URLs, IDs, or licence values in the manifest.

## 7. Acquisition and benchmark workflow

1. Read and agree to the official AIM-500 release agreement before downloading.
2. Read and agree to the official release agreement yourself before downloading. Install the local-only requirements and run `python benchmarks/acquire_aim500.py --accept-release-terms`. The explicit flag is required; the script does not accept the agreement on your behalf. The tool captures the full SHA of `main` and `refs/convert/parquet` before and after loading through the supported default Datasets path. It aborts if either changes during loading, and records both immutable SHAs in the JSON report and citation file. It writes the 16 selected RGB/alpha pairs under ignored `benchmarks/results/aim500/` and places the MIT notice and paper citation alongside them.
3. Review the JSON report, category/type mix, hashes, dimensions, MIT notice, citation, and explicit original-photo copyright note. The selected 16 are category-balanced candidates; visually inspect them before assigning fine-grained challenge labels or publishing per-case conclusions.
4. Keep images/mattes local. The acquisition workflow uploads metadata only; it does not upload image or matte binaries.
5. Run MODNet and each candidate on the exact same input bytes, dimensions, resize policy, and cache/device conditions. Keep outputs and timing results local.
6. Score alpha-ground-truth cases using the original soft mattes. Do not binarise alpha mattes or pool these scores with binary-mask benchmarks.
7. Include the IJCAI 2021 citation in research documents/papers and retain the upstream MIT notice with any copy/substantial portion of the dataset.
8. Before publishing or redistributing any raw photograph/matte, verify the original owner's licence and attribution requirements; the MIT Dataset notice does not transfer photo copyright.


**Current decision:** AIM-500 is the preferred source for the first real-world alpha benchmark, subject to per-image rights verification and a visual match to each case. Open Images V7 is the fallback for a small, separately reported binary-mask extension. No source images have yet been approved, downloaded, or registered in the manifest, and no model scores have been measured.
