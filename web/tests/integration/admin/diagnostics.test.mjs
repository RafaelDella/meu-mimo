import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { adminFixture, closeRuntime } from './helpers.mjs';
import { errorCode } from '../helpers/http-client.mjs';
after(closeRuntime);

test('stdout de Next e gateway não expõe busca motivo cookies tokens ou mensagem SQL desconhecida', { timeout: 60_000 }, async t => {
  const f = await adminFixture(t); const directory = path.resolve(`../.artifacts/${f.environment.task}-runtime`);
  const files = ['next-integration.log', 'media-integration.log'].map(file => path.join(directory, file));
  const before = await Promise.all(files.map(file => readFile(file, 'utf8')));
  await f.adminRead('/api/admin/contas/consulta', { q: f.privateMarker });
  await f.adminRead('/api/admin/lojas/consulta', { q: f.privateMarker });
  const id = randomUUID(); const name = `t13_logs_${randomUUID().replaceAll('-', '')}`;
  await f.database.query(`CREATE FUNCTION app."${name}"() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.id='${id}'::uuid THEN RAISE EXCEPTION USING MESSAGE=NEW.reason, ERRCODE='P0001'; END IF; RETURN NEW; END $$`);
  await f.database.query(`CREATE TRIGGER "${name}" BEFORE INSERT ON app."AdminAction" FOR EACH ROW EXECUTE FUNCTION app."${name}"()`);
  try {
    const result = await errorCode(await f.admin.client.post('/api/admin/acoes', { operationId: id, target: { type: 'STORE', id: f.store.id },
      action: 'PAUSE_STORE', expectedVersion: 0, reason: f.privateMarker }, { Authorization: `Bearer ${f.privateMarker}` }), 503, 'service_unavailable');
    assert.equal(JSON.stringify(result).includes(f.privateMarker), false);
    const secretValues = [f.privateMarker, f.admin.email, f.admin.client.storedSession().access_token,
      process.env.SUPABASE_SERVICE_ROLE_KEY, process.env.AUTH_RATE_LIMIT_SECRET].filter(Boolean);
    let logs = '';
    const deadline = Date.now() + 3000;
    do {
      logs = (await Promise.all(files.map(async (file, index) => (await readFile(file, 'utf8')).slice(before[index].length)))).join('\n');
      if (logs.includes('ACTION_APPLY') && logs.includes('UNAVAILABLE')) break;
      await delay(25);
    } while (Date.now() < deadline);
    for (const value of secretValues) assert.equal(logs.includes(value), false, 'Logs não podem conter valores privados.');
    const events = logs.split(/\r?\n/).filter(line => line.startsWith('{')).map(line => JSON.parse(line));
    assert.ok(events.some(event => event.route === 'ACTION_APPLY' && event.result === 'UNAVAILABLE' && event.status === 503));
    for (const event of events) assert.deepEqual(Object.keys(event).sort(), ['correlationId', 'durationMs', 'result', 'route', 'status']);
  } finally {
    await f.database.query(`DROP TRIGGER "${name}" ON app."AdminAction"`); await f.database.query(`DROP FUNCTION app."${name}"()`);
  }
});
