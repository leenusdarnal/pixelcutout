import test from 'node:test';
import assert from 'node:assert/strict';
import { releaseImageResources } from './resource-lifecycle.js';

test('terminates the active worker before revoking image URLs', () => {
  const events = [];

  const result = releaseImageResources({
    worker: { terminate: () => events.push('terminate') },
    objectUrls: ['blob:original', 'blob:cutout'],
    revokeObjectURL: (url) => events.push(`revoke:${url}`)
  });

  assert.deepEqual(events, [
    'terminate',
    'revoke:blob:original',
    'revoke:blob:cutout'
  ]);
  assert.deepEqual(result, { terminatedWorker: true, revokedUrls: 2 });
});

test('revokes duplicate object URLs only once', () => {
  const revoked = [];

  const result = releaseImageResources({
    objectUrls: ['blob:shared', 'blob:shared', '', null, undefined],
    revokeObjectURL: (url) => revoked.push(url)
  });

  assert.deepEqual(revoked, ['blob:shared']);
  assert.deepEqual(result, { terminatedWorker: false, revokedUrls: 1 });
});

test('does nothing when there are no active resources', () => {
  const revoked = [];

  const result = releaseImageResources({
    worker: null,
    objectUrls: [],
    revokeObjectURL: (url) => revoked.push(url)
  });

  assert.deepEqual(revoked, []);
  assert.deepEqual(result, { terminatedWorker: false, revokedUrls: 0 });
});
