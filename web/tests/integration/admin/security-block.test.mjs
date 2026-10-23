import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { adminFixture, closeRuntime } from './helpers.mjs';
import { errorCode, expectStatus } from '../helpers/http-client.mjs';
after(closeRuntime);

test('bloqueio da conta retira todos os dados próprios e URL de mídia já assinada inclusive Range', { timeout: 60_000 }, async t => {
  const f = await adminFixture(t); const activity = await f.create(); const draft = await f.prepare(activity);
  const photo = await f.photo(draft); assert.equal((await photo.process()).processed, 1);
  const record = await f.submit(draft, f.ana, { evidenceAssetId: photo.asset.id });
  await f.credit(); const reward = await f.createReward({ stock: 2 }); const ticket = await f.redeem(reward);
  const note = await f.send(f.privateMarker);
  const access = await f.ana.client.post(`${photo.target}/acesso`, { variant: 'display' }); expectStatus(access, 200);
  const grant = await access.json(); expectStatus(await f.ana.client.get(grant.url, { Range: 'bytes=0-15' }), 206);
  const before = await f.financial();
  await f.action({ type: 'ACCOUNT', id: f.ana.id }, 'BLOCK_ACCOUNT');
  for (const path of ['/api/auth/session', '/api/lojas', f.base(), f.submissionPath(record), f.ticketPath(ticket),
    `${f.base()}/bilhete`, '/api/notificacoes/grupos', `${f.base()}/pontos`,
    `${f.rewardPath(reward)}/operacoes/${ticket.request.operationId}`, photo.target, f.versionPath(note.applied)]) {
    await errorCode(await f.ana.client.get(path), 403, 'account_suspended');
  }
  await errorCode(await f.ana.client.get(grant.url, { Range: 'bytes=0-15' }), 403);
  expectStatus(await f.owner.client.get(f.submissionPath(record)), 200);
  expectStatus(await f.owner.client.get(f.ticketPath(ticket)), 200);
  assert.equal((await f.note()).current.text, f.privateMarker);
  assert.deepEqual(await f.financial(), before);
  await f.action({ type: 'ACCOUNT', id: f.ana.id }, 'UNBLOCK_ACCOUNT');
  expectStatus(await f.ana.client.get(f.ticketPath(ticket)), 200);
  expectStatus(await f.ana.client.get(grant.url, { Range: 'bytes=0-15' }), 206);
});

test('bloqueio do lojista preserva a audiência da outra pessoa e não encerra vínculo nem loja', { timeout: 60_000 }, async t => {
  const f = await adminFixture(t); const sent = await f.send(); const record = await f.received();
  await f.action({ type: 'ACCOUNT', id: f.owner.id }, 'BLOCK_ACCOUNT');
  await errorCode(await f.owner.client.get(f.base()), 403, 'account_suspended');
  assert.equal((await f.read(f.versionPath(sent.applied), f.ana)).text, sent.applied.text);
  expectStatus(await f.ana.client.get(f.submissionPath(record)), 200);
  const state = await f.read(f.base(), f.ana); assert.equal(state.state, 'ACTIVE'); assert.equal(state.membershipClosedAt, null);
});

test('reativar conta não remove revogação de sessão nem pausa da plataforma', { timeout: 60_000 }, async t => {
  const f = await adminFixture(t);
  await f.action({ type: 'STORE', id: f.store.id }, 'PAUSE_STORE');
  await f.action({ type: 'ACCOUNT', id: f.ana.id }, 'BLOCK_ACCOUNT');
  const token = f.ana.client.storedSession().access_token;
  const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
  await f.database.query('UPDATE app."AuthSession" SET "revokedAt"=clock_timestamp() WHERE id=$1', [claims.session_id]);
  await f.action({ type: 'ACCOUNT', id: f.ana.id }, 'UNBLOCK_ACCOUNT');
  await errorCode(await f.ana.client.get('/api/auth/session'), 401, 'session_invalid');
  assert.ok((await f.adminRead(`/api/admin/lojas/${f.store.id}`)).platformPausedAt);
});
