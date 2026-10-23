import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { rm, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { relationshipFixture, closeRuntime } from '../relationship/helpers.mjs';
import { albumFixture } from '../albums/helpers.mjs';
import { errorCode, expectStatus } from '../helpers/http-client.mjs';
import { withRightsOperator } from '../../../scripts/check-rights-migration-helpers.mjs';
import { openRightsProtocol, applyRights, exportRights, rightsStatus } from '../../../scripts/pilot/rights.mjs';
import { custodyRoot, backupKey, readPrivateJson } from '../../../scripts/pilot/custody.mjs';
import { openJson, decryptComponent } from '../../../scripts/pilot/archive.mjs';
after(closeRuntime);

const options = { mode: 'integration' };
async function exportedMetadata(protocolId) {
  const directory = path.join(custodyRoot, 'exports', protocolId); const key = await backupKey(protocolId);
  const manifest = openJson({ envelope: await readPrivateJson(path.join(directory, 'manifest.json')), key, id: protocolId, name: 'export-manifest' });
  const staging = path.join(custodyRoot, 'temp', `export-test-${protocolId}`); let text = ''; let records = [];
  try {
    for (const component of manifest.components.filter(item => item.kind !== 'media')) {
      const opened = await decryptComponent({ component, key, id: protocolId, directory, destinationDirectory: staging });
      const contents = await readFile(opened.file, 'utf8'); text += contents;
      if (component.kind === 'json') records = JSON.parse(contents).records;
    }
    return { manifest, text, records };
  } finally { key.fill(0); await rm(staging, { recursive: true, force: true }); }
}
async function protocol(t, f, subject, kind = 'ERASURE', extra = {}) {
  const input = { operationId: randomUUID(), subjectProfileId: subject.id, operatorProfileId: f.owner.id,
    kind, verifiedAt: new Date(Date.now() - 1000).toISOString(), ...extra };
  const result = await openRightsProtocol(input, options);
  t.after(async () => {
    // Only artifacts named by this synthetic fixture's newly allocated UUID are removed.
    // The encrypted minimum journal survives fixture cleanup, like every erasure intent.
    await rm(path.join(custodyRoot, 'exports', input.operationId), { recursive: true, force: true });
    await rm(path.join(custodyRoot, 'keys', `${input.operationId}.key`), { force: true });
  });
  return { input, ...result };
}

test('direitos locais exigem fixture rastreada e preservam intenção idempotente', async t => {
  const f = await relationshipFixture(t);
  const p = await protocol(t, f, f.ana);
  assert.equal(p.protocolId, p.input.operationId);
  assert.equal((await openRightsProtocol(p.input, options)).protocolId, p.protocolId);
  await assert.rejects(openRightsProtocol({ ...p.input, subjectProfileId: f.bia.id }, options));
  await assert.rejects(openRightsProtocol({ ...p.input, kind: 'EXPORT' }, options));
  await f.auth.auth.admin.updateUserById(f.bia.id, { app_metadata: { local_fixture: null } });
  await assert.rejects(openRightsProtocol({ ...p.input, operationId: randomUUID(), subjectProfileId: f.bia.id }, options));
  assert.equal((await f.database.query('SELECT id FROM app."DataRightsProtocol" WHERE "subjectProfileId"=$1', [f.bia.id])).rowCount, 0);
});

test('supressão por autoria nega sessão antiga e preserva texto alheio e financeiro', async t => {
  const f = await relationshipFixture(t);
  const thread = await f.thread();
  const ownText = 'Texto autoral sintético a suprimir'; const otherText = 'Texto da outra autora preservado';
  await f.comment(thread, ownText, f.ana); await f.comment(thread, otherText, f.owner);
  await f.react(thread, '❤️', f.ana);
  await f.credit(); const reward = await f.createReward({ cost: 10, stock: 2 }); await f.redeem(reward);
  const before = await f.financial();
  const p = await protocol(t, f, f.ana);
  const report = await applyRights(p.protocolId, options);
  f.trackAuthRemoval(f.ana.id);
  assert.equal(report.status, 'PARTIAL'); assert.ok(report.pending.length > 0);
  await errorCode(await f.ana.client.get('/api/perfil'), 401);
  const comments = await f.read(`${f.base()}/conversas/${thread.id}/comentarios`, f.owner);
  const serialized = JSON.stringify(comments);
  assert.equal(serialized.includes(ownText), false); assert.equal(serialized.includes(otherText), true);
  assert.match(serialized, /Conteúdo removido/);
  const reactions = await f.read(f.reactionPath(thread), f.owner);
  assert.equal(JSON.stringify(reactions).includes('❤️'), false);
  assert.deepEqual(await f.financial(), before);
  const repeated = await applyRights(p.protocolId, options);
  assert.equal(repeated.status, 'PARTIAL');
  assert.deepEqual(await f.financial(), before);
  assert.equal((await rightsStatus(p.protocolId, options)).status, 'PARTIAL');
});

test('exportação cifrada de Ana exclui relação e bilhete privados de Bia e segredos', async t => {
  const f = await relationshipFixture(t);
  const anaText = 'Bilhete privado de Ana'; const biaText = 'Bilhete exclusivo de Bia';
  await f.send(anaText); await f.send(biaText, {}, f.otherParticipation);
  const p = await protocol(t, f, f.ana, 'EXPORT');
  const report = await exportRights(p.protocolId, options);
  assert.equal(report.status, 'EXPORT_READY');
  assert.equal(new Date(report.expiresAt).getTime() > Date.now(), true);
  const directory = path.join(custodyRoot, 'exports', p.protocolId);
  const key = await backupKey(p.protocolId);
  const manifest = openJson({ envelope: await readPrivateJson(path.join(directory, 'manifest.json')), key, id: p.protocolId, name: 'export-manifest' });
  assert.equal(manifest.kind, 'export'); assert.equal(manifest.protocolId, p.protocolId);
  const staging = path.join(custodyRoot, 'temp', `export-test-${p.protocolId}`);
  let text = '';
  try {
    for (const component of manifest.components) {
      const opened = await decryptComponent({ component, key, id: p.protocolId, directory, destinationDirectory: staging });
      text += await readFile(opened.file, 'utf8');
    }
    assert.equal(text.includes(anaText), true); assert.equal(text.includes(biaText), false);
    for (const secret of [f.bia.email, f.bia.password, f.environment.serviceRoleKey, process.env.AUTH_RATE_LIMIT_SECRET]) assert.equal(text.includes(secret), false);
    assert.equal((await readdir(directory)).some(name => name.endsWith('.plain') || name.endsWith('.partial')), false);
  } finally { await rm(staging, { recursive: true, force: true }); }
});

test('exportação não recupera legenda e bytes de foto removida do álbum', async t => {
  const f = await albumFixture(t); const [asset] = await f.ready();
  const caption = 'Legenda sintética removida pelo fluxo normal';
  await f.publish([{ assetId: asset.id, caption }]);
  expectStatus(await f.owner.client.post(`${f.assetPath(asset.id)}/remover`, {}), 200);
  assert.equal((await f.album(f.ana)).total, 0);
  assert.equal((await f.database.query('SELECT caption FROM app."AlbumItem" WHERE "assetId"=$1', [asset.id])).rows[0].caption, caption);
  const p = await protocol(t, f, f.ana, 'EXPORT'); await exportRights(p.protocolId, options);
  const exported = await exportedMetadata(p.protocolId);
  assert.equal(exported.text.includes(caption), false);
  assert.equal(exported.manifest.components.some(item => item.kind === 'media' && item.assetId === asset.id), false);
});

test('supressão IDENTITY isolada também impede exportar mídia pela credencial operacional', async t => {
  const f = await albumFixture(t); const [asset] = await f.ready(); await f.publish([asset.id]);
  const erasure = await protocol(t, f, f.owner, 'ERASURE', { operatorProfileId: f.bia.id });
  await withRightsOperator(f.database, async () => {
    await f.database.query(`INSERT INTO app."DataSuppression"("subjectProfileId",scope,"protocolId") VALUES($1,'IDENTITY',$2)`, [f.owner.id, erasure.protocolId]);
  });
  const p = await protocol(t, f, f.ana, 'EXPORT', { operatorProfileId: f.bia.id }); await exportRights(p.protocolId, options);
  const exported = await exportedMetadata(p.protocolId);
  assert.equal(exported.manifest.components.some(item => item.kind === 'media' && item.assetId === asset.id), false);
  assert.equal(exported.records.some(item => item.type === 'MediaAsset' && item.data.id === asset.id), false);
});

test('evidência em análise permanece protegida e URLs anteriores perdem GET e Range', async t => {
  const f = await relationshipFixture(t); const activity = await f.create(); const draft = await f.prepare(activity);
  const photo = await f.photo(draft); await photo.process();
  await f.submit(draft, f.ana, { evidenceAssetId: photo.asset.id });
  const access = await f.owner.client.post(`${photo.target}/acesso`, { variant: 'display' }); expectStatus(access, 200);
  const grant = await access.json(); expectStatus(await f.owner.client.get(grant.url, { Range: 'bytes=0-15' }), 206);
  const p = await protocol(t, f, f.ana); const report = await applyRights(p.protocolId, options); f.trackAuthRemoval(f.ana.id);
  assert.ok(report.counts.mediaHeld >= 1);
  await errorCode(await f.owner.client.get(grant.url), 404);
  await errorCode(await f.owner.client.get(grant.url, { Range: 'bytes=0-15' }), 404);
  const held = (await f.database.query(`SELECT a.state,a."removedAt",c."retentionHold" FROM app."MediaAsset" a
    JOIN app."MediaCollection" c ON c.id=a."collectionId" WHERE a.id=$1`, [photo.asset.id])).rows[0];
  assert.deepEqual(held, { state: 'READY', removedAt: null, retentionHold: true });
});
