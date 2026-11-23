import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const page = readFileSync(new URL('./routes/+page.svelte', import.meta.url), 'utf8');
const worker = readFileSync(new URL('./lib/workers/remove-background.ts', import.meta.url), 'utf8');
const serviceWorker = readFileSync(new URL('./service-worker.js', import.meta.url), 'utf8');

test('the AI runtime is not imported by the page and worker creation follows an explicit action', () => {
  assert.doesNotMatch(page, /@huggingface\\/transformers/);
  assert.match(page, /function removeWithAi\\(\\)\\s*\\{\\s*beginProcessing\\(\\{\\s*type: 'process-ai'/);
  assert.match(page, /function ensureWorker\\(\\)\\s*\\{[\\s\\S]*?new Worker\\(/);
  assert.match(page, /function beginProcessing\\(message:[\\s\\S]*?ensureWorker\\(\\)/);
});

test('the model loader stays inside the AI worker path', () => {
  assert.match(worker, /async function getTransformers\\(\\)[\\s\\S]*?await import\\('@huggingface\\/transformers'\\)/);
  assert.equal((worker.match(/getTransformers\\(\\)/g) ?? []).length, 2,
    'getTransformers should be declared once and called only by loadRemover');

  assert.match(worker, /if \\(message\\?\\.type === 'process-ai'\\) \\{[\\s\\S]*?runRemoval\\(message\\.file\\)/);
  assert.match(worker, /else if \\(message\\?\\.type === 'process-manual'\\) \\{[\\s\\S]*?removeSampledColor\\(message\\.file/);
  assert.equal((worker.match(/runRemoval\\(message\\.file\\)/g) ?? []).length, 1,
    'only the AI message handler should invoke the model path');
});

test('the image worker does not add an application upload request path', () => {
  assert.doesNotMatch(worker, /\\bfetch\\s*\\(/);
  assert.match(worker, /runRemoval\\(message\\.file\\)/);
  assert.match(worker, /removeSampledColor\\(message\\.file/);
});

test('the service worker bypasses non-GET and cross-origin requests', () => {
  assert.match(serviceWorker, /if \\(request\\.method !== 'GET' \\|\\| url\\.origin !== self\\.location\\.origin\\) return;/);
});

test('the service worker caches only compiled app assets and explicit PWA files', () => {
  assert.match(serviceWorker, /immutable\\.map\\(\\(\\{ path \\}\\) => resolve\\(path\\)\\)/);
  assert.match(serviceWorker, /path\\.endsWith\\('\\.webmanifest'\\) \\|\\| path\\.endsWith\\('\\.svg'\\)/);
  assert.match(serviceWorker, /if \\(APP_ASSETS\\.includes\\(url\\.pathname\\)\\)/);
});
