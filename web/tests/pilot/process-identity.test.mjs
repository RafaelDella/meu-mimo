import test from 'node:test';
import assert from 'node:assert/strict';
import { observeProcess, sameProcess } from '../../scripts/pilot/process-identity.mjs';

test('identidade é observada no SO e não se reduz ao PID salvo', async () => {
  const identity = await observeProcess(process.pid);
  assert.deepEqual(Object.keys(identity).sort(), ['creationTime', 'executable', 'pid']);
  assert.equal(identity.pid, process.pid); assert.ok(identity.creationTime.length > 4 && identity.executable.length > 4);
  assert.equal(await sameProcess(identity), true);
  assert.equal(await sameProcess({ ...identity, creationTime: `${identity.creationTime}-reused` }), false);
  assert.equal(await sameProcess({ ...identity, executable: `${identity.executable}.foreign` }), false);
});

test('entrada de PID malformada é recusada antes de consultar ou sinalizar o SO', async () => {
  for (const value of [0, -1, 1.5, '1; exit', Number.MAX_SAFE_INTEGER]) {
    await assert.rejects(() => observeProcess(value));
  }
});
