import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { unlink } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { adminRoutes, adminResults } from '../../src/server/admin/diagnostic-types.ts';
import { custodyRoot, readPrivateJson } from '../../scripts/pilot/custody.mjs';
import { knownLocalLog, writeAdminDiagnostic } from '../../scripts/pilot/local-diagnostics.mjs';

test('diagnóstico administrativo conserva só envelope permitido e prazo de sete dias', async () => {
  const correlationId = randomUUID(); const file = path.join(custodyRoot, 'logs', `${correlationId}.json`);
  const event = { route: adminRoutes[0], result: adminResults[0], status: 200, durationMs: 12.5, correlationId };
  try {
    await writeAdminDiagnostic({ ...event, message: 'Conteúdo privado não permitido' });
    await assert.rejects(readPrivateJson(file), { code: 'ENOENT' });
    await writeAdminDiagnostic(event); const value = await readPrivateJson(file);
    assert.equal(knownLocalLog(value, correlationId), true);
    assert.deepEqual(Object.keys(value).sort(), ['code', 'counts', 'createdAt', 'expiresAt', 'formatVersion', 'id', 'kind']);
    assert.deepEqual(value.counts, { status: 200, durationMs: 13 });
    assert.equal(Date.parse(value.expiresAt) - Date.parse(value.createdAt), 7 * 86400000);
    await writeAdminDiagnostic(event); assert.deepEqual(await readPrivateJson(file), value);
    assert.equal(knownLocalLog({ ...value, message: 'Não aceitar texto' }, correlationId), false);
    assert.equal(knownLocalLog({ ...value, code: 'T13_unknown_unknown' }, correlationId), false);
  } finally { try { await unlink(file); } catch (error) { if (error.code !== 'ENOENT') throw error; } }
});
