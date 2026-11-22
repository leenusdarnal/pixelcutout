import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(new URL('./validate-manifest.mjs', import.meta.url));
const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));

function runValidator(...args) {
  return spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: repositoryRoot,
    encoding: 'utf8'
  });
}

test('benchmark manifest validator resolves the benchmarks directory', () => {
  const result = runValidator();

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Benchmark manifest valid: \d+\/16 cases; image hashes verified\./);
});

test('require-complete reports every missing benchmark case', () => {
  const result = runValidator('--require-complete');

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Missing benchmark cases: B01, B02, B03/);
  assert.match(result.stderr, /B16/);
});
