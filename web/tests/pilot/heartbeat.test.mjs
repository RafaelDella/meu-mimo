import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const file = fileURLToPath(new URL('../fixtures/pilot-heartbeat.mjs', import.meta.url));

function launch(ipc = true) {
  const child = spawn(process.execPath, [file], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', ...(ipc ? ['ipc'] : [])] });
  const messages = []; const output = []; child.stdout.on('data', data => output.push(data.toString())); child.stderr.resume();
  child.on('message', value => messages.push({ value, received: performance.now() }));
  const ended = new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', (code, signal) => resolve({ code, signal })); });
  return { child, messages, output, ended, owner: randomUUID() };
}
async function message(fixture, predicate, timeout = 9000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const found = fixture.messages.find(predicate); if (found) return found;
    if (fixture.child.exitCode !== null || fixture.child.signalCode !== null) throw new Error('O filho terminou antes da mensagem esperada.');
    await delay(20);
  }
  throw new Error('Heartbeat esperado não chegou.');
}
async function cleanup(fixture) {
  if (fixture.child.exitCode !== null || fixture.child.signalCode !== null) return;
  if (fixture.child.connected) fixture.child.send({ formatVersion: 1, type: 'STOP', owner: fixture.owner });
  await Promise.race([fixture.ended, delay(3000)]);
  if (fixture.child.exitCode === null && fixture.child.signalCode === null) fixture.child.kill();
  await fixture.ended;
}
function boot(fixture) { fixture.child.send({ formatVersion: 1, type: 'BOOT', owner: fixture.owner, role: 'media' }); }

test('heartbeat continua enquanto ocupado e STOP encerra o filho próprio por IPC', { timeout: 15000 }, async () => {
  const f = launch();
  try {
    boot(f);
    const first = await message(f, entry => entry.value.phase === 'busy');
    const second = await message(f, entry => entry.value.phase === 'busy' && entry.received - first.received >= 4500);
    assert.ok(second.value.sequence > first.value.sequence); assert.equal(second.value.owner, f.owner);
    assert.equal(second.value.pid, f.child.pid); assert.deepEqual(second.value.lastRound.counts, { processed: 1 });
    assert.ok(!JSON.stringify(second.value).includes('environment'));
    f.child.send({ formatVersion: 1, type: 'STOP', owner: f.owner });
    await message(f, entry => entry.value.type === 'STOPPED' && entry.value.phase === 'stopped');
    assert.deepEqual(await f.ended, { code: 0, signal: null });
  } finally { await cleanup(f); }
});

test('desconexão do parent drena e termina sem depender de sinal por PID', { timeout: 10000 }, async () => {
  const f = launch();
  try { boot(f); await message(f, entry => entry.value.phase === 'busy'); f.child.disconnect();
    assert.deepEqual(await f.ended, { code: 0, signal: null });
  } finally { await cleanup(f); }
});

test('comando standalone não fica aguardando BOOT nem deixa timer ativo', { timeout: 10000 }, async () => {
  const f = launch(false);
  try { assert.deepEqual(await f.ended, { code: 0, signal: null }); assert.equal(f.output.join(''), 'STANDALONE_READY\n'); }
  finally { await cleanup(f); }
});
