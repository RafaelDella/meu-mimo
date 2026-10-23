import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { openRequestLifecycle, trackRequestOperation } from '../../src/server/request-lifecycle.ts';

test('sem supervisor a operação preserva retorno e falha', async () => {
  assert.equal(await trackRequestOperation(async () => 15), 15);
  await assert.rejects(trackRequestOperation(async () => { throw new Error('fixture'); }), /fixture/);
});

test('drenagem espera operações admitidas, inclui falhas e fecha admissão de unidades tardias', async () => {
  const lifecycle = openRequestLifecycle(); let release; let writes = 0; let drained = false;
  const work = trackRequestOperation(async () => {
    await new Promise(resolve => { release = resolve; }); writes += 1; return 15;
  });
  const failed = trackRequestOperation(async () => { throw new Error('falha própria'); });
  const observedFailure = assert.rejects(failed, /falha própria/);
  lifecycle.closeAdmission(); const draining = lifecycle.drain().then(() => { drained = true; });
  await assert.rejects(async () => trackRequestOperation(async () => { writes += 100; }), { status: 503 });
  await delay(20); assert.equal(drained, false); assert.equal(writes, 0);
  release(); assert.equal(await work, 15); await observedFailure; await draining;
  assert.equal(writes, 1); assert.equal(drained, true);
  await lifecycle.drain();
  await assert.rejects(async () => trackRequestOperation(async () => { writes += 100; }), { status: 503 });
  assert.equal(writes, 1); assert.throws(openRequestLifecycle);
});
