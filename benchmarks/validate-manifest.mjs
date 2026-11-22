#!/usr/bin/env node
/**
 * Validate local benchmark metadata and verify image SHA-256 digests.
 * Benchmark binaries belong in benchmarks/images/ (git-ignored), never in app assets.
 */
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { basename, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const benchmarkDir = resolve(fileURLToPath(new URL('.', import.meta.url)));
const manifestPath = join(benchmarkDir, 'manifest.json');
const imageRoot = resolve(benchmarkDir, 'images');
const expectedIds = Array.from({ length: 16 }, (_, index) => `B${String(index + 1).padStart(2, '0')}`);
const required = ['filename', 'source', 'creator', 'license', 'sha256', 'width', 'height'];
const errors = [];

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
  if (!expectedIds.includes(entry.id)) errors.push(`Unknown case ID: ${entry.id}`);
  if (seen.has(entry.id)) errors.push(`Duplicate case ID: ${entry.id}`);
  seen.add(entry.id);

  for (const key of required) {
    if (entry[key] === undefined || entry[key] === null || entry[key] === '') {
      errors.push(`${entry.id ?? '(unknown)'}: missing ${key}`);
    }
  }
  if (!entry.filename || basename(entry.filename) !== entry.filename) {
    errors.push(`${entry.id ?? '(unknown)'}: filename must be a simple filename, not a path`);
    continue;
  }
  if (!/^[a-f0-9]{64}$/i.test(entry.sha256 ?? '')) {
    errors.push(`${entry.id}: sha256 must be 64 hexadecimal characters`);
    continue;
  }
  if (!Number.isSafeInteger(entry.width) || entry.width < 1 ||
      !Number.isSafeInteger(entry.height) || entry.height < 1) {
    errors.push(`${entry.id}: width and height must be positive integers`);
    continue;
  }

  const imagePath = resolve(imageRoot, entry.filename);
  if (!imagePath.startsWith(imageRoot + sep)) {
    errors.push(`${entry.id}: image path escapes the local images directory`);
    continue;
  }
  try {
    const info = await stat(imagePath);
    if (!info.isFile()) throw new Error('not a file');
    const digest = createHash('sha256').update(await readFile(imagePath)).digest('hex');
    if (digest.toLowerCase() !== entry.sha256.toLowerCase()) {
      errors.push(`${entry.id}: SHA-256 mismatch for ${entry.filename}`);
    }
  } catch (error) {
    errors.push(`${entry.id}: cannot read images/${entry.filename} (${error.message})`);
  }
}

if (process.argv.includes('--require-complete')) {
  const missing = expectedIds.filter((id) => !seen.has(id));
  if (missing.length) errors.push(`Missing benchmark cases: ${missing.join(', ')}`);
}

if (errors.length) {
  console.error(errors.map((error) => `- ${error}`).join('\n'));
  process.exit(1);
}

console.log(`Benchmark manifest valid: ${cases.length}/16 cases; image hashes verified.`);
