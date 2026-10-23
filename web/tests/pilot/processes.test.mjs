import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import net from 'node:net';
import { test } from 'node:test';
import { observeProcess, sameProcess } from '../../scripts/pilot/process-identity.mjs';
import { assertPortFree, claimSupervisor, publishSupervisor, releaseSupervisor,
  readSupervisor, postStopRequest, hasStopRequest } from '../../scripts/pilot/process-custody.mjs';

test('porta ocupada é preservada e bloqueia a apropriação do supervisor', async () => {
  await assertPortFree(4303);
  const server = net.createServer(socket => socket.end('fixture própria'));
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(4303, '127.0.0.1', resolve); });
  try {
    await assert.rejects(claimSupervisor(await observeProcess(process.pid)), { code: 'LOCAL_PORT_IN_USE' });
    assert.ok(server.listening);
    const content = await new Promise((resolve, reject) => {
      let data = ''; const socket = net.connect(4303, '127.0.0.1');
      socket.on('data', chunk => { data += chunk; }); socket.on('end', () => resolve(data)); socket.on('error', reject);
    });
    assert.equal(content, 'fixture própria');
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('instância concorrente e pedido de outro dono são recusados sem parar o processo', async () => {
  const manager = await observeProcess(process.pid); const snapshot = await claimSupervisor(manager);
  try {
    await assert.rejects(claimSupervisor(manager), { code: 'LOCAL_ALREADY_RUNNING' });
    await assert.rejects(postStopRequest({ ...snapshot, owner: randomUUID() }), { code: 'LOCAL_OWNERSHIP_CONFLICT' });
    await assert.rejects(postStopRequest({ ...snapshot, manager: { ...manager, creationTime: `${manager.creationTime}-reused` } }),
      { code: 'LOCAL_OWNERSHIP_CONFLICT' });
    await assert.rejects(publishSupervisor({ ...snapshot, unexpected: 'rejected' }), { code: 'PROCESS_CONTRACT_INVALID' });
    await postStopRequest(snapshot); assert.equal(await hasStopRequest(snapshot.owner), true);
    await assert.rejects(hasStopRequest(randomUUID()), { code: 'LOCAL_OWNERSHIP_CONFLICT' });
    assert.equal(await sameProcess(manager), true);
    assert.equal((await readSupervisor()).owner, snapshot.owner);
  } finally {
    snapshot.phase = 'STOPPED'; snapshot.status = 'stopped'; snapshot.updatedAt = new Date().toISOString();
    await releaseSupervisor(snapshot);
  }
});
