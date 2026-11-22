# PixelCutout model benchmark protocol

**Status:** Benchmark set defined; source images and hashes not yet collected.  
**Purpose:** Select the lightest model/runtime that meets PixelCutout's broad-subject and fine-edge quality requirements.  
**Product constraint:** All image pixels stay local. Benchmark images are test fixtures only and must never be included in the deployed site.

## 1. Benchmark set

Use the same 16 images for every model candidate. Preserve a high-quality local original and create a standardised 2,048-pixel-long-edge evaluation copy for comparable inference timing. Keep original aspect ratio and do not sharpen, denoise, or otherwise alter subject edges.

| ID | Category | Required challenge | What a good cutout preserves |
|---|---|---|---|
| B01 | Person / hair | Straight dark hair against a dark or detailed background | Hair outline without background holes |
| B02 | Person / hair | Curly or coiled hair with flyaways and backlighting | Fine strands and soft hair edges |
| B03 | Person / clothing | Full-body pose with loose clothing, straps, or gaps | Limbs, fabric edges, and real openings |
| B04 | Pet / fur | Long-haired dog or cat with varied fur colours | Fur texture without a hard cutout edge |
| B05 | Pet / low contrast | Dark animal against a dark background | Complete subject silhouette |
| B06 | Pet / low contrast | White animal against a bright background | Ears, whiskers, and pale fur |
| B07 | Product | Small product on a clean white background with a cast shadow | Product shape without excessive shadow removal |
| B08 | Product / low contrast | Dark product against a dark or similarly coloured surface | Product boundary and controls |
| B09 | Product / translucent | Glass, clear bottle, or reflective object | Transparent/reflection detail where possible; record limitations |
| B10 | Everyday object | Irregular household object with handles, holes, or thin parts | Full object contour and negative spaces |
| B11 | Plant / leaves | Plant with many overlapping leaves and thin stems | Individual leaves and stem edges |
| B12 | Fine structure | Bicycle spokes, mesh chair, or wire basket | Thin lines and holes between them |
| B13 | Fine material | Lace, netting, or patterned fabric | Open weave and fine cut-through areas |
| B14 | Natural detail | Small branches, feathers, or similar delicate structure | Thin branches/feather edges |
| B15 | Difficult background | Subject and background share similar colours or texture | Subject completeness with low background leakage |
| B16 | Occlusion / busy scene | Multiple overlapping subjects or cluttered surroundings | Intended foreground objects without background fragments |

Use only images owned by the project, created for the benchmark, or licensed for this test use. Prefer public-domain, CC0, or clearly compatible permissive licences. Record creator, source URL, exact licence, and any attribution requirement. Do not use non-commercial or no-derivatives material for a benchmark that may later inform a commercial product decision.

## 2. Keep benchmark assets out of the application

Store local test images under `benchmarks/images/`, which must be git-ignored. Do not place them under `static/`, `public/`, or any Vite-imported source directory. Commit only this protocol and a metadata manifest (ID, filename, source, creator, licence, SHA-256, dimensions). Do not commit the test image binaries or copy them to the deployed site.

Each local image should have a SHA-256 digest recorded in the manifest so that model comparisons use identical inputs. Keep a separate notes column for known image-specific difficulty or ground-truth availability.

## 3. Quality scoring

Score each result visually from 1 (unusable) to 5 (excellent) in these dimensions:

| Dimension | Weight | Review focus |
|---|---:|---|
| Subject preservation | 30% | No missing parts, holes, or accidental transparency inside the subject |
| Fine-edge retention | 30% | Hair, fur, leaves, threads, spokes, and delicate structure remain convincing |
| Background removal | 20% | Background leakage and disconnected remnants are minimal |
| Halo / edge cleanliness | 10% | No obvious bright/dark fringe, jagged edge, or colour contamination |
| Consistency / artifacts | 10% | No unexpected blobs, blur, or unstable output across the image |

For images with reliable ground-truth masks, also record mask IoU/F1 and boundary F-score at a fixed pixel tolerance. These metrics supplement, but do not replace, visual review of alpha edges and translucent material. Do not invent ground truth for images that do not have it.

A model candidate should not be selected solely because it is small or fast. Flag any critical failure where an important part of the subject disappears, the background remains as a large connected region, or the mask damages important fine structures.

## 4. Runtime and performance protocol

For each candidate, record:

- Exact model repository, revision/commit, licence, runtime version, and model file names.
- Actual model download bytes, runtime/WASM bytes, and total first-use transfer bytes separately.
- Cold start including model loading, then median of three warm inference runs.
- Peak memory or the best available device memory indicator.
- WebGPU and WASM results separately; record unsupported or failed combinations rather than silently excluding them.
- Device, browser/version, operating system, image ID, dimensions, and whether assets were already cached.

Use the same device, browser version, test image, cache state, and input dimensions when comparing candidates. Run at least one desktop-class and one mid-range Android device before choosing the production default. Do not claim first-load performance based only on Vite emitted asset sizes; use a browser network waterfall.

## 5. Candidate comparison sheet

| Candidate / revision | Licence | Model bytes | Runtime bytes | Cold start | Warm median | Peak memory | WebGPU | WASM | Quality score | Notes |
|---|---|---:|---:|---:|---:|---:|---|---|---:|---|
| Current Xenova/modnet | Apache-2.0 (verify exact revision) | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | Portrait-focused baseline; do not assume broad-subject quality |
| Candidate B | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | |
| Candidate C | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | |

## 6. Selection rule

1. Eliminate candidates with incompatible or unclear licences before benchmarking.
2. Reject candidates that produce critical failures in common subject groups or consistently damage fine edges.
3. Among candidates that meet the quality bar, choose the lightest and most compatible runtime.
4. Keep one production model/runtime path unless measured evidence supports a second path.
5. Record the final decision and trade-offs in this file and update `docs/PROJECT_TRACKER.md`.

**Current conclusion:** no replacement model has been selected. The current MODNet path remains the baseline until the 16-case set is populated and candidates are measured.
