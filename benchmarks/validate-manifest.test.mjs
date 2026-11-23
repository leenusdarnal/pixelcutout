import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(new URL('./validate-manifest.mjs', import.meta.url));
const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));
const benchmarkScript = join(repositoryRoot, 'benchmarks', 'validate-manifest.mjs');

function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

function makeEntry(id, overrides = {}) {
  const imageBytes = Buffer.from(`image fixture ${id}`);
  const annotationBytes = Buffer.from(`alpha fixture ${id}`);

  return {
    id,
    filename: `${id.toLowerCase()}-source.jpg`,
    source: 'AIM-500 v1.0',
    creator: 'Original photographer from source metadata',
    license: 'CC BY 2.0',
    sha256: digest(imageBytes),
    width: 1600,
    height: 1200,
    dataset_name: 'AIM-500',
    dataset_version: 'v1.0',
    dataset_item_id: `upstream-${id.toLowerCase()}`,
    source_landing_url: 'https://images.example.org/photo/123',
    image_license_url: 'https://creativecommons.org/licenses/by/2.0/',
    dataset_agreement_url: 'https://datasets.example.org/aim-500/agreement',
    annotation_filename: `${id.toLowerCase()}-alpha.png`,
    annotation_type: 'alpha',
    annotation_license: 'MIT',
    annotation_license_url: 'https://opensource.org/license/mit/',
    annotation_sha256: digest(annotationBytes),
    annotation_width: 1600,
    annotation_height: 1200,
    license_status: 'pending',
    rights_checked_on: null,
    attribution: 'Attribution required; verify exact wording',
    notes: `Fixture for ${id}`,
    ...overrides,
    _fixture: { imageBytes, annotationBytes }
  };
}

function createHarness(entries) {
  const root = mkdtempSync(join(tmpdir(), 'pixelcutout-benchmark-'));
  const benchmarkDir = join(root, 'benchmarks');
  const imageRoot = join(benchmarkDir, 'images');
  const maskRoot = join(benchmarkDir, 'masks');
  mkdirSync(imageRoot, { recursive: true });
  mkdirSync(maskRoot, { recursive: true });
  copyFileSync(benchmarkScript, join(benchmarkDir, 'validate-manifest.mjs'));

  const cleanEntries = entries.map(({ _fixture, ...entry }) => entry);
  for (const entry of entries) {
    const fixture = entry._fixture;
    if (entry.filename && basename(entry.filename) === entry.filename) {
      writeFileSync(join(imageRoot, entry.filename), fixture.imageBytes);
    }
    if (entry.annotation_filename && basename(entry.annotation_filename) === entry.annotation_filename) {
      writeFileSync(join(maskRoot, entry.annotation_filename), fixture.annotationBytes);
    }
  }
  writeFileSync(join(benchmarkDir, 'manifest.json'), JSON.stringify({
    version: 1,
    cases: cleanEntries
  }, null, 2));

  return {
    root,
    run(...args) {
      return spawnSync(process.execPath, [
        join(benchmarkDir, 'validate-manifest.mjs'),
        ...args
      ], { cwd: root, encoding: 'utf8' });
    },
    cleanup() {
      rmSync(root, { recursive: true, force: true });
    }
  };
}

function runFixture(entries, ...args) {
  const harness = createHarness(entries);
  try {
    return harness.run(...args);
  } finally {
    harness.cleanup();
  }
}

function approvedEntry(id, overrides = {}) {
  return makeEntry(id, {
    license_status: 'approved',
    rights_checked_on: '2026-11-23',
    attribution: 'Photographer name; source page; CC BY 2.0',
    ...overrides
  });
}

test('benchmark manifest validator resolves the benchmarks directory', () => {
  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: repositoryRoot,
    encoding: 'utf8'
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Benchmark manifest valid: \d+\/16 cases;/);
});

test('require-complete reports every missing benchmark case', () => {
  const result = spawnSync(process.execPath, [scriptPath, '--require-complete'], {
    cwd: repositoryRoot,
    encoding: 'utf8'
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Missing benchmark cases: B01, B02, B03/);
  assert.match(result.stderr, /B16/);
});

test('pending fixture can be validated locally but cannot complete the approved benchmark', () => {
  const pending = makeEntry('B01');
  const normal = runFixture([pending]);
  assert.equal(normal.status, 0, normal.stderr || normal.stdout);
  assert.match(normal.stdout, /pending: 1/);

  const complete = runFixture([pending], '--require-complete');
  assert.equal(complete.status, 1);
  assert.match(complete.stderr, /B01: license status is pending; rights review is incomplete/);
});

test('approved fixture requires a real rights-check date', () => {
  const entry = approvedEntry('B01', { rights_checked_on: null });
  const result = runFixture([entry]);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /B01: approved fixture requires rights_checked_on in YYYY-MM-DD format/);
});

test('validator verifies annotation file path and SHA-256', () => {
  const unsafePath = approvedEntry('B01', { annotation_filename: '../outside.png' });
  const unsafeResult = runFixture([unsafePath]);
  assert.equal(unsafeResult.status, 1);
  assert.match(unsafeResult.stderr, /B01: annotation_filename must be a simple filename/);

  const wrongHash = approvedEntry('B01', { annotation_sha256: '0'.repeat(64) });
  const hashResult = runFixture([wrongHash]);
  assert.equal(hashResult.status, 1);
  assert.match(hashResult.stderr, /B01: SHA-256 mismatch for annotation/);
});

test('validator requires HTTPS provenance links and matching annotation dimensions', () => {
  const insecure = approvedEntry('B01', { image_license_url: 'http://example.org/license' });
  const insecureResult = runFixture([insecure]);
  assert.equal(insecureResult.status, 1);
  assert.match(insecureResult.stderr, /B01: image_license_url must be a valid HTTPS URL/);

  const wrongDimensions = approvedEntry('B01', { annotation_width: 800 });
  const dimensionsResult = runFixture([wrongDimensions]);
  assert.equal(dimensionsResult.status, 1);
  assert.match(dimensionsResult.stderr, /B01: annotation dimensions must match the source image dimensions/);
});

test('require-alpha-complete rejects binary masks while complete accepts an approved mixed set', () => {
  const entries = Array.from({ length: 16 }, (_, index) => {
    const id = `B${String(index + 1).padStart(2, '0')}`;
    return approvedEntry(id, index === 11 ? { annotation_type: 'binary' } : {});
  });

  const complete = runFixture(entries, '--require-complete');
  assert.equal(complete.status, 0, complete.stderr || complete.stdout);

  const alphaComplete = runFixture(entries, '--require-alpha-complete');
  assert.equal(alphaComplete.status, 1);
  assert.match(alphaComplete.stderr, /B12: annotation_type is binary; alpha benchmark requires alpha/);
});

test('validator rejects unknown annotation types and licence states', () => {
  const badType = makeEntry('B01', { annotation_type: 'trimap' });
  const typeResult = runFixture([badType]);
  assert.equal(typeResult.status, 1);
  assert.match(typeResult.stderr, /B01: annotation_type must be alpha or binary/);

  const badStatus = makeEntry('B01', { license_status: 'probably' });
  const statusResult = runFixture([badStatus]);
  assert.equal(statusResult.status, 1);
  assert.match(statusResult.stderr, /B01: license_status must be pending, approved, or excluded/);
});
