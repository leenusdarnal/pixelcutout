# Benchmark manifest

This manifest tracks the local image fixtures described in [MODEL_BENCHMARK.md](../docs/MODEL_BENCHMARK.md). The committed manifest contains metadata only; source images are intentionally excluded from Git and the app build.

## Add a case

1. Obtain an image you own or whose licence explicitly permits the intended evaluation and potential commercial product research. Record the exact source, creator, and licence/attribution requirements.
2. Put the image in `benchmarks/images/` using a simple filename. This directory is git-ignored.
3. Add one object to `manifest.json` with the matching case ID, filename, source, creator, licence, SHA-256 digest, and pixel dimensions.
4. Run `npm run benchmark:validate`. When all 16 cases are populated, run `npm run benchmark:validate -- --require-complete`.

Example entry:

```json
{
  "id": "B01",
  "filename": "person-hair.jpg",
  "source": "https://example.org/source-page",
  "creator": "Creator name",
  "license": "CC0 1.0; no attribution required",
  "sha256": "replace-with-64-character-file-digest",
  "width": 1600,
  "height": 1200
}
```

Generate a digest locally with Node.js:

```sh
node --input-type=module -e "import {createHash} from 'node:crypto'; import {readFileSync} from 'node:fs'; console.log(createHash('sha256').update(readFileSync(process.argv[1])).digest('hex'))" benchmarks/images/person-hair.jpg
```

The validator uses only Node.js built-ins. It checks required metadata, IDs, duplicate entries, safe filenames, local file existence, dimensions, and exact SHA-256 matches. It does not fetch URLs or upload images.
