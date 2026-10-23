import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { relationshipFixture, closeRuntime, deliver } from './helpers.mjs';
import { errorCode } from '../helpers/http-client.mjs';
after(closeRuntime);

test('leituras T12 exigem sessão atual e não concedem audiência ao administrador', async t => {
  const f = await relationshipFixture(t); const thread = await f.thread(); const sent = await f.send();
  const admin = await f.user();
  await f.database.query('INSERT INTO app."AdminGrant" ("profileId") VALUES ($1)', [admin.id]);
  const targets = [f.ownNotePath, f.notePath(), f.versionPath(sent.applied), f.reactionPath(thread),
    `${f.base()}/mural`, `${f.base()}/resumo`, `${f.base()}/lojinha`, `${f.base()}/participacoes/${f.participation.id}/resumo`, f.preferencePath];
  for (const target of targets) {
    await errorCode(await f.client().get(target), 401);
    await errorCode(await admin.client.get(target), 404);
  }
  assert.equal((await f.groups(admin)).total, 0);
});

test('revogação retira bilhete, reação, mural, painel, lookup e destino já entregue', async t => {
  const f = await relationshipFixture(t); const thread = await f.thread(); const sent = await f.send();
  const reacted = await f.react(thread); await deliver();
  const group = (await f.groups(f.ana)).items.find(item => item.category === 'NOTES');
  await f.database.query('UPDATE app."Membership" SET "accessRevokedAt"=clock_timestamp() WHERE id=$1', [f.participation.id]);
  for (const target of [f.ownNotePath, f.versionPath(sent.applied), f.reactionPath(thread),
    `${f.reactionPath(thread)}/operacoes/${reacted.event.id}`, `${f.base()}/mural`, `${f.base()}/lojinha`, f.preferencePath,
    `/api/notificacoes/grupos/${group.id}/destino`]) await errorCode(await f.ana.client.get(target), 404);
  assert.equal((await f.groups(f.ana)).total, 0);
  await errorCode(await f.owner.client.patch(f.notePath(), sent.request), 404);
});

test('T12 rejeita origem cruzada, contexto forjado e parâmetros inválidos', async t => {
  const f = await relationshipFixture(t); const thread = await f.thread();
  await errorCode(await f.owner.client.patch(f.notePath(), { operationId: randomUUID(), expectedVersion: 0, text: 'Privado' }, { Origin: 'https://example.test' }), 403);
  await errorCode(await f.ana.client.request(f.reactionPath(thread), { method: 'PUT', json: { operationId: randomUUID(), expectedVersion: 0, emoji: '❤️' }, headers: { Origin: 'https://example.test' } }), 403);
  await errorCode(await f.ana.client.patch(f.preferencePath, { operationId: randomUUID(), expectedVersion: 0, socialMuted: true, automaticApprovalNotices: true }, { Origin: 'https://example.test' }), 403);
  const otherStore = await f.createStore(f.owner, 'Outra loja'); await f.addMembership(otherStore, f.owner, 'MERCHANT'); await f.addMembership(otherStore, f.ana);
  const changed = f.reactionPath(thread).replace(f.store.id, otherStore.id);
  await errorCode(await f.ana.client.get(changed), 404);
  for (const query of ['?type=SUBMISSION&status=FULFILLED', '?status=DRAFT', '?status=ANNULLED', '?pageSize=51', '?from=2026-02-30', '?from=2026-10-23&to=2026-10-22']) {
    await errorCode(await f.ana.client.get(`${f.base()}/mural${query}`), 400);
  }
});

test('novas rotas compartilham limites de conta 120/30 e fornecem Retry-After', async t => {
  const f = await relationshipFixture(t);
  for (const [kind, count, request] of [
    ['read', 120, () => f.ana.client.get(f.ownNotePath)],
    ['write', 30, () => f.ana.client.patch(f.preferencePath, { operationId: randomUUID(), expectedVersion: 0, socialMuted: false, automaticApprovalNotices: true })],
  ]) {
    const key = createHmac('sha256', process.env.AUTH_RATE_LIMIT_SECRET).update('meumimo:t04:domain-rate:v1\0').update(kind).update('\0').update(f.ana.id).digest('hex');
    await f.database.query('INSERT INTO app."AuthRateBucket" (key,attempts) VALUES ($1,ARRAY(SELECT clock_timestamp() FROM generate_series(1,$2::int))) ON CONFLICT (key) DO UPDATE SET attempts=EXCLUDED.attempts', [key, count]);
    const response = await request(); await errorCode(response, 429);
    assert.ok(Number(response.headers.get('retry-after')) > 0);
  }
});
