import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const page = readFileSync(new URL('./routes/+page.svelte', import.meta.url), 'utf8');
const worker = readFileSync(new URL('./lib/workers/remove-background.ts', import.meta.url), 'utf8');
const serviceWorker = readFileSync(new URL('./service-worker.js', import.meta.url), 'utf8');

test('the AI runtime is not imported by the page and worker creation follows an explicit action', () => {
  assert.equal(page.includes("@huggingface/transformers"), false);
  assert.ok(page.includes("function removeWithAi()"));
  assert.ok(page.includes("beginProcessing({ type: 'process-ai' })"));
  assert.ok(page.includes("new Worker(new URL('../lib/workers/remove-background.ts'"));
  assert.ok(page.includes('ensureWorker();'));
});

test('the model loader stays inside the AI worker path', () => {
  assert.ok(worker.includes("await import('@huggingface/transformers')"));
  assert.equal(worker.split('getTransformers()').length - 1, 2,
    'getTransformers should be declared once and called only by loadRemover');

  assert.ok(worker.includes("if (message?.type === 'process-ai')"));
  assert.ok(worker.includes('runRemoval(message.file)'));
  assert.ok(worker.includes("else if (message?.type === 'process-manual')"));
  assert.ok(worker.includes('removeSampledColor(message.file, color, message.tolerance)'));
  assert.equal(worker.split('runRemoval(message.file)').length - 1, 1,
    'only the AI message handler should invoke the model path');
});

test('the image worker does not add an application upload request path', () => {
  assert.equal(worker.includes('fetch('), false);
  assert.ok(worker.includes('runRemoval(message.file)'));
  assert.ok(worker.includes('removeSampledColor(message.file, color, message.tolerance)'));
});

test('the service worker bypasses non-GET and cross-origin requests', () => {
  assert.ok(serviceWorker.includes(
    "if (request.method !== 'GET' || url.origin !== self.location.origin) return;"
  ));
});

test('the service worker caches only compiled app assets and explicit PWA files', () => {
  assert.ok(serviceWorker.includes('immutable.map(({ path }) => resolve(path))'));
  assert.ok(serviceWorker.includes("path.endsWith('.webmanifest') || path.endsWith('.svg')"));
  assert.ok(serviceWorker.includes('if (APP_ASSETS.includes(url.pathname))'));
});
