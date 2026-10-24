import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { domainFixture } from './helpers.mjs';
import { acceptCode, codeInvitation, searchCode } from './code-helpers.mjs';
import { errorCode, expectStatus } from '../helpers/http-client.mjs';
import { closeRuntime, deliver } from '../conversations/helpers.mjs';

after(closeRuntime);

test('buscar não consome e código/link compartilham usos; cada ingresso produz seu aviso', async t => {
  const f = await domainFixture(t);
  const owner = await f.user();
  const ana = await f.user();
  const bia = await f.user();
  const store = await f.createDomainStore(owner);
  const invitation = await codeInvitation(owner, store, { maxUses: 2 });
  const code = `${invitation.code.slice(0, 5)}-${invitation.code.slice(5)}`.toLowerCase();
  const preview = await searchCode(ana, ` ${code} `);
  assert.equal(preview.invitation.viewerAction, 'JOIN');
  assert.deepEqual(Object.keys(preview.invitation).sort(), ['status', 'store', 'inviter', 'viewerAction'].sort());
  assert.deepEqual(Object.keys(preview.invitation.store).sort(), ['id', 'name', 'presentation'].sort());
  assert.equal((await searchCode(owner, code)).invitation.viewerAction, 'MANAGE');
  assert.equal((await f.database.query('SELECT "useCount" FROM app."Invitation" WHERE id=$1', [invitation.id])).rows[0].useCount, 0);
  const first = await acceptCode(ana, code);
  assert.deepEqual(await acceptCode(ana, code), first);
  assert.equal((await searchCode(ana, code)).invitation.viewerAction, 'OPEN');
  const throughLink = await bia.client.post(`/api/convites/${invitation.token}/aceitar`, {});
  expectStatus(throughLink, 200);
  const second = await throughLink.json();
  assert.notEqual(first.membershipId, second.membershipId);
  const row = (await f.database.query('SELECT "useCount","acceptedAt","acceptedByProfileId","acceptedMembershipId" FROM app."Invitation" WHERE id=$1', [invitation.id])).rows[0];
  assert.deepEqual(row, { useCount: 2, acceptedAt: null, acceptedByProfileId: null, acceptedMembershipId: null });
  const uses = await f.database.query('SELECT id FROM app."InvitationUse" WHERE "invitationId"=$1', [invitation.id]);
  assert.equal(uses.rowCount, 2);
  const events = await f.database.query('SELECT key,"invitationUseId" FROM app."OutboxEvent" WHERE "invitationId"=$1', [invitation.id]);
  assert.equal(events.rowCount, 2);
  for (const event of events.rows) assert.equal(event.key, `invitation.use.accepted:${event.invitationUseId}`);
  const publicPreview = await f.client().get(`/api/convites/${invitation.token}`);
  expectStatus(publicPreview, 200);
  assert.equal((await publicPreview.json()).status, 'EXHAUSTED');
  await deliver();
  const notifications = await owner.client.get('/api/notificacoes');
  expectStatus(notifications, 200);
  assert.equal((await notifications.json()).items.filter(item => item.kind === 'INVITATION_ACCEPTED').length, 2);
});

test('esgotamento e revogação preservam quem entrou e impedem novos ingressos', async t => {
  const f = await domainFixture(t);
  const owner = await f.user();
  const first = await f.user();
  const newcomer = await f.user();
  const store = await f.createDomainStore(owner);
  const invitation = await codeInvitation(owner, store);
  const membership = await acceptCode(first, invitation.code);
  await errorCode(await newcomer.client.post('/api/convites/aceitar-codigo', { code: invitation.code }), 409, 'invitation_exhausted');
  expectStatus(await owner.client.post(`/api/lojas/${store.id}/convites/${invitation.id}/revogar`, {}), 200);
  assert.equal((await searchCode(first, invitation.code)).invitation.viewerAction, 'OPEN');
  assert.deepEqual(await acceptCode(first, invitation.code), membership);
  await errorCode(await newcomer.client.post('/api/convites/aceitar-codigo', { code: invitation.code }), 409, 'invitation_revoked');
  const history = await f.database.query('SELECT id FROM app."InvitationUse" WHERE "invitationId"=$1', [invitation.id]);
  assert.equal(history.rowCount, 1);
});

test('falha de uso, auditoria ou outbox desfaz vínculo, contador e efeitos do aceite', async t => {
  const f = await domainFixture(t);
  const owner = await f.user();
  const person = await f.user();
  const store = await f.createDomainStore(owner);
  const invitation = await codeInvitation(owner, store, { maxUses: null });
  for (const table of ['InvitationUse', 'StoreAudit', 'OutboxEvent']) {
    const name = `invitation_proof_${randomUUID().replaceAll('-', '')}`;
    const exception = table === 'StoreAudit' ? ` OR action <> 'invitation.accepted'` : '';
    await f.database.query(`ALTER TABLE app."${table}" ADD CONSTRAINT "${name}" CHECK ("storeId" <> '${store.id}'::uuid${exception})`);
    try {
      await errorCode(await person.client.post('/api/convites/aceitar-codigo', { code: invitation.code }), 503);
      assert.equal((await f.database.query('SELECT id FROM app."Membership" WHERE "storeId"=$1 AND "profileId"=$2', [store.id, person.id])).rowCount, 0);
      assert.equal((await f.database.query('SELECT "useCount" FROM app."Invitation" WHERE id=$1', [invitation.id])).rows[0].useCount, 0);
      assert.equal((await f.database.query('SELECT id FROM app."InvitationUse" WHERE "invitationId"=$1', [invitation.id])).rowCount, 0);
      assert.equal((await f.database.query('SELECT id FROM app."StoreAudit" WHERE "storeId"=$1 AND action=$2', [store.id, 'invitation.accepted'])).rowCount, 0);
      assert.equal((await f.database.query('SELECT id FROM app."OutboxEvent" WHERE "invitationId"=$1', [invitation.id])).rowCount, 0);
    } finally { await f.database.query(`ALTER TABLE app."${table}" DROP CONSTRAINT "${name}"`); }
  }
  await acceptCode(person, invitation.code);
});
