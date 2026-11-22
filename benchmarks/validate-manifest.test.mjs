import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(new URL('./validate-manifest.mjs', import.meta.url));
const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));

test('benchmark manifest validator resolves the benchmarks directory', () => {
  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: repositoryRoot,
    encoding: 'utf8'
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Benchmark manifest valid: \d+\/16 cases; image hashes verified\./);
});
