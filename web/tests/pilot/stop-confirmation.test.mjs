import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { observeStopCompletion } from '../../scripts/pilot/processes.mjs';

function scenario() {
  const manager = { pid: 101, creationTime: 'manager-created', executable: process.execPath };
  const child = { pid: 102, creationTime: 'child-created', executable: process.execPath };
  const expected = { owner: randomUUID(), manager };
  let snapshot = { formatVersion: 1, task: 't14', mode: 'development', ...expected,
    phase: 'DRAINING', status: 'stopping', updatedAt: new Date().toISOString(), maintenance: null,
    children: { next: { identity: child, state: 'stopped', heartbeat: null } } };
  return { expected, manager, child, get: () => structuredClone(snapshot),
    set: update => { snapshot = { ...snapshot, ...update }; },
    stopped: () => { snapshot = { ...snapshot, phase: 'STOPPED', status: 'stopped' }; } };
}

test('parada concluída durante a observação nativa do manager recebe confirmação', async () => {
  const s = scenario();
  const result = await observeStopCompletion(s.expected, { readSnapshot: async () => s.get(),
    sameProcess: async identity => { if (identity.pid === s.manager.pid) s.stopped(); return false; } });
  assert.equal(result, 'stopped');
});

test('manager ausente sem STOPPED comprovado conserva pendência', async () => {
  for (const phase of ['DRAINING', 'FAILED']) {
    const s = scenario(); s.set({ phase, status: phase === 'FAILED' ? 'failed' : 'stopping' });
    assert.equal(await observeStopCompletion(s.expected, { readSnapshot: async () => s.get(), sameProcess: async () => false }), 'pending');
  }
});

test('STOPPED em arquivo não basta quando um filho ainda está vivo', async () => {
  const s = scenario(); s.stopped();
  assert.notEqual(await observeStopCompletion(s.expected, { readSnapshot: async () => s.get(),
    sameProcess: async identity => identity.pid === s.child.pid }), 'stopped');
});

test('mudança de owner ou criação do manager durante a consulta recusa confirmação', async () => {
  for (const change of ['owner', 'manager']) {
    const s = scenario();
    await assert.rejects(observeStopCompletion(s.expected, { readSnapshot: async () => s.get(), sameProcess: async identity => {
      if (identity.pid === s.manager.pid) {
        s.stopped(); s.set(change === 'owner' ? { owner: randomUUID() } : { manager: { ...s.manager, creationTime: 'reused' } });
      }
      return false;
    } }), { code: 'LOCAL_OWNERSHIP_CONFLICT' });
  }
});

test('troca de snapshot durante a prova de saída dos filhos também é recusada', async () => {
  const s = scenario(); s.stopped();
  await assert.rejects(observeStopCompletion(s.expected, { readSnapshot: async () => s.get(), sameProcess: async identity => {
    if (identity.pid === s.child.pid) s.set({ owner: randomUUID() }); return false;
  } }), { code: 'LOCAL_OWNERSHIP_CONFLICT' });
});
