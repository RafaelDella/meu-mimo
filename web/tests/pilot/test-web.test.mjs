import assert from 'node:assert/strict';
import test from 'node:test';
import { assertTestFiles, stopTestChild } from '../../scripts/pilot/test-web.mjs';

test('QA aceita apenas os cenários conhecidos e recusa opções de listagem/configuração', () => {
  assert.doesNotThrow(() => assertTestFiles([]));
  assert.doesNotThrow(() => assertTestFiles(['performance.spec.ts', 'cycle.spec.ts']));
  for (const args of [['--list'], ['--config', 'other.ts'], ['../cycle.spec.ts'], ['cycle.spec.ts', 'cycle.spec.ts']]) {
    assert.throws(() => assertTestFiles(args));
  }
});

test('filho já encerrado por sinal não recebe kill nem aguarda um segundo exit', async () => {
  await stopTestChild({ pid: 1, exitCode: null, signalCode: 'SIGTERM', kill() { assert.fail('Filho encerrado.'); },
    once() { assert.fail('O evento exit já aconteceu.'); } });
});
