import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const page = readFileSync(new URL('./+page.svelte', import.meta.url), 'utf8');

test('the empty state offers one supported image upload path', () => {
  assert.match(page, /class="upload-card"/);
  assert.match(page, /accept="image\/png,image\/jpeg,image\/webp"/);
  assert.match(page, /Choose an image/);
  assert.match(page, /Drop an image here/);
  assert.match(page, /Up to 20 MB/);
});

test('the workflow is deliberately limited to one image at a time', () => {
  assert.match(page, /One image at a time/);
  assert.match(page, /droppedFiles\.length > 1/);
  assert.match(page, /Please drop a single image/);
});

test('AI inference is a deliberate primary action and manual removal stays secondary', () => {
  assert.match(page, /onclick=\{removeWithAi\}/);
  assert.match(page, /Use manual colour removal/);
  assert.match(page, /onclick=\{removeWithoutAi\}/);
});

test('the result comparison is keyboard-operable and labelled', () => {
  assert.match(page, /class="comparison-range"/);
  assert.match(page, /aria-label="Before and after comparison"/);
  assert.match(page, /aria-valuetext=/);
  assert.match(page, /aria-controls="original-preview cutout-preview"/);
});

test('uploaded images are kept fully visible in the preview', () => {
  assert.match(page, /\.preview-image\s*\{[^}]*object-fit:\s*contain/s);
  assert.match(page, /\.preview-stage\.checker/);
  assert.match(page, /\.preview-stage\.dark/);
  assert.match(page, /\.preview-stage\.light/);
});

test('focus, reduced motion, processing, and error states are explicit', () => {
  assert.match(page, /:global\(button:focus-visible\)/);
  assert.match(page, /prefers-reduced-motion:\s*reduce/);
  assert.match(page, /aria-live="polite"/);
  assert.match(page, /role="alert"/);
  assert.match(page, /role="progressbar"/);
});

test('privacy copy distinguishes local image pixels from model downloads', () => {
  assert.match(page, /Image pixels are processed in your browser, never uploaded/);
  assert.match(page, /downloads its model and runtime after you choose removal/);
});
