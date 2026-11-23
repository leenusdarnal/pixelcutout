#!/usr/bin/env node
/**
 * Validate local benchmark image/matte metadata, provenance and SHA-256 digests.
 * Benchmark pixels belong in ignored local folders, never in app assets.
 */
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { basename, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const benchmarkDir = resolve(fileURLToPath(new URL('.', import.meta.url)));
const manifestPath = join(benchmarkDir, 'manifest.json');
const imageRoot = resolve(benchmarkDir, 'images');
const annotationRoot = resolve(benchmarkDir, 'masks');
const expectedIds = Array.from({ length: 16 }, (_, index) => `B${String(index + 1).padStart(2, '0')}`);
const required = [
  'filename', 'source', 'creator', 'license', 'sha256', 'width', 'height',
  'dataset_name', 'dataset_version', 'dataset_item_id', 'source_landing_url',
  'image_license_url', 'dataset_agreement_url', 'annotation_filename',
  'annotation_type', 'annotation_license', 'annotation_license_url',
  'annotation_sha256', 'annotation_width', 'annotation_height',
  'license_status', 'attribution', 'notes'
];
const errors = [];

function isPositiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function isDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function validateHttpsUrl(entry, field) {
  try {
    const url = new URL(entry[field]);
    if (url.protocol !== 'https:') throw new Error('not HTTPS');
  } catch {
    errors.push(`${entry.id}: ${field} must be a valid HTTPS URL`);
  }
}

async function verifyLocalFile(entry, { field, hashField, root, label }) {
  const filename = entry[field];
  if (typeof filename !== 'string' || !filename || basename(filename) !== filename) {
    errors.push(`${entry.id}: ${field} must be a simple filename, not a path`);
    return;
  }

  const expectedHash = entry[hashField];
  if (typeof expectedHash !== 'string' || !/^[a-f0-9]{64}$/i.test(expectedHash)) {
    errors.push(`${entry.id}: ${hashField} must be a 64-character SHA-256 digest`);
    return;
  }

  const filePath = resolve(root, filename);
  if (!filePath.startsWith(root + sep)) {
    errors.push(`${entry.id}: ${field} escapes its local benchmark directory`);
    return;
  }

  try {
    const info = await stat(filePath);
    if (!info.isFile() || info.size === 0) throw new Error('not a non-empty file');
    const digest = createHash('sha256').update(await readFile(filePath)).digest('hex');
    if (digest.toLowerCase() !== expectedHash.toLowerCase()) {
      errors.push(`${entry.id}: SHA-256 mismatch for ${label} ${filename}`);
    }
  } catch (error) {
    errors.push(`${entry.id}: cannot read ${label} ${filename} (${error.message})`);
  }
}

let manifest;
try {
  manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
} catch (error) {
  console.error(`Cannot read valid JSON at ${manifestPath}: ${error.message}`);
  process.exit(1);
}

if (manifest.version !== 1 || !Array.isArray(manifest.cases)) {
  errors.push('Manifest must have version: 1 and a cases array.');
}

const cases = Array.isArray(manifest.cases) ? manifest.cases : [];
const seen = new Set();

for (const entry of cases) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    errors.push('Every case must be an object.');
    continue;
  }

  const id = entry.id ?? '(unknown)';
  if (!expectedIds.includes(entry.id)) errors.push(`Unknown case ID: ${id}`);
  if (seen.has(entry.id)) errors.push(`Duplicate case ID: ${entry.id}`);
  seen.add(entry.id);

  for (const key of required) {
    if (entry[key] === undefined || entry[key] === null || entry[key] === '') {
      errors.push(`${id}: missing ${key}`);
    }
  }
  if (!Object.hasOwn(entry, 'rights_checked_on')) {
    errors.push(`${id}: missing rights_checked_on (use null until rights are verified)`);
  }

  if (!['pending', 'approved', 'excluded'].includes(entry.license_status)) {
    errors.push(`${id}: license_status must be pending, approved, or excluded`);
  }
  if (!['alpha', 'binary'].includes(entry.annotation_type)) {
    errors.push(`${id}: annotation_type must be alpha or binary`);
  }

  for (const field of [
    'source_landing_url',
    'image_license_url',
    'dataset_agreement_url',
    'annotation_license_url'
  ]) {
    validateHttpsUrl(entry, field);
  }

  if (entry.rights_checked_on !== null && !isDate(entry.rights_checked_on)) {
    errors.push(`${id}: rights_checked_on must be a valid YYYY-MM-DD date or null`);
  }
  if (entry.license_status === 'approved' && !isDate(entry.rights_checked_on)) {
    errors.push(`${id}: approved fixture requires rights_checked_on in YYYY-MM-DD format`);
  }

  if (!isPositiveInteger(entry.width) || !isPositiveInteger(entry.height)) {
    errors.push(`${id}: width and height must be positive integers`);
  }
  if (!isPositiveInteger(entry.annotation_width) || !isPositiveInteger(entry.annotation_height)) {
    errors.push(`${id}: annotation_width and annotation_height must be positive integers`);
  } else if (entry.annotation_width !== entry.width || entry.annotation_height !== entry.height) {
    errors.push(`${id}: annotation dimensions must match the source image dimensions`);
  }

  await verifyLocalFile(entry, {
    field: 'filename',
    hashField: 'sha256',
    root: imageRoot,
    label: 'image'
  });
  await verifyLocalFile(entry, {
    field: 'annotation_filename',
    hashField: 'annotation_sha256',
    root: annotationRoot,
    label: 'annotation'
  });
}

const requireComplete = process.argv.includes('--require-complete');
const requireAlphaComplete = process.argv.includes('--require-alpha-complete');

if (requireComplete || requireAlphaComplete) {
  const missing = expectedIds.filter((id) => !seen.has(id));
  if (missing.length) errors.push(`Missing benchmark cases: ${missing.join(', ')}`);

  for (const entry of cases) {
    if (entry?.license_status !== 'approved') {
      errors.push(`${entry?.id ?? '(unknown)'}: license status is ${entry?.license_status ?? 'missing'}; rights review is incomplete`);
    }
    if (requireAlphaComplete && entry?.annotation_type !== 'alpha') {
      errors.push(`${entry?.id ?? '(unknown)'}: annotation_type is ${entry?.annotation_type ?? 'missing'}; alpha benchmark requires alpha`);
    }
  }
}

if (errors.length) {
  console.error(errors.map((error) => `- ${error}`).join('\n'));
  process.exit(1);
}

const counts = cases.reduce((result, entry) => {
  result[entry.license_status] += 1;
  return result;
}, { approved: 0, pending: 0, excluded: 0 });

console.log(
  `Benchmark manifest valid: ${cases.length}/16 cases; image and annotation hashes verified (approved: ${counts.approved}, pending: ${counts.pending}, excluded: ${counts.excluded}).`
);
