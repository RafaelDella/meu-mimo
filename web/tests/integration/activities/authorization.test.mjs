import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { activityFixture, closeRuntime, fields } from './helpers.mjs';
import { errorCode, expectStatus } from '../helpers/http-client.mjs';

after(closeRuntime);

test('atividade, registro, rascunho e saldo respeitam duas pessoas, outra loja e admin sem bypass', async t => {
  const f = await activityFixture(t);
  const activity = await f.create({ approvalMode: 'AUTOMATIC' });
  const draft = await f.prepare(activity);
  const received = await f.submit(draft);
  const otherOwner = await f.user();
  const otherStore = await f.createStore(otherOwner, 'Outra loja T07');
  await f.addMembership(otherStore, otherOwner, 'MERCHANT');
  const admin = await f.user();
  await f.database.query('INSERT INTO app."AdminGrant" ("profileId") VALUES ($1)', [admin.id]);
  for (const person of [otherOwner, admin]) {
    for (const target of [f.activityPath(activity), f.submissionPath(received), `${f.base()}/pontos?membershipId=${f.participation.id}`]) {
      await errorCode(await person.client.get(target), 404);
    }
  }
  await errorCode(await f.owner.client.get(f.submissionPath(received, otherStore)), 404);
  await errorCode(await f.bia.client.get(f.submissionPath(received)), 404);
  await errorCode(await f.bia.client.get(`${f.base()}/pontos?membershipId=${f.participation.id}`), 404);
  await errorCode(await f.ana.client.get(`${f.base()}/registros?membershipId=${f.otherParticipation.id}`), 404);
  assert.equal((await f.read(f.bia, `${f.base()}/registros`)).total, 0);
  assert.equal((await f.balance(f.bia)).available, '0');
  assert.equal((await f.balance(f.owner, f.participation)).available, '15');
  for (const person of [f.ana, f.bia]) {
    await errorCode(await person.client.post(`${f.base()}/atividades`, { operationId: randomUUID(), ...fields() }), 404);
  }
  await errorCode(await f.owner.client.post(`${f.activityPath(activity)}/preparar`, { operationId: randomUUID() }), 404);
  const otherDraft = await f.prepare(activity, f.bia);
  await errorCode(await f.ana.client.post(`${f.submissionPath(otherDraft)}/enviar`, f.body(otherDraft)), 404);
});

test('revogação e suspensão retiram leitura, conversa, saldo e envio sem vazar dados', async t => {
  const f = await activityFixture(t);
  const activity = await f.create();
  const received = await f.submit(await f.prepare(activity));
  await f.database.query('UPDATE app."Membership" SET "accessRevokedAt"=now() WHERE id=$1', [f.participation.id]);
  for (const target of [f.activityPath(activity), f.submissionPath(received), `${f.base()}/pontos`,
    `${f.base()}/conversas/${received.conversation.id}/comentarios`]) {
    await errorCode(await f.ana.client.get(target), 404);
  }
  await errorCode(await f.ana.client.post(`${f.submissionPath(received)}/enviar`, received.request), 404);
  await f.database.query('UPDATE app."Profile" SET "suspendedAt"=now() WHERE id=$1', [f.bia.id]);
  for (const target of [`${f.base()}/atividades`, `${f.base()}/pontos`]) {
    const response = await f.bia.client.get(target);
    assert.ok([401, 403].includes(response.status));
    assert.doesNotMatch(await response.text(), new RegExp(activity.name));
  }
});

test('rotas mutáveis exigem origem e cookie; consultas privadas usam no-store', async t => {
  const f = await activityFixture(t);
  const activity = await f.create();
  const draft = await f.prepare(activity);
  for (const [person, path, body] of [
    [f.owner, `${f.base()}/atividades`, { operationId: randomUUID(), ...fields() }],
    [f.ana, `${f.activityPath(activity)}/preparar`, { operationId: randomUUID() }],
    [f.ana, `${f.submissionPath(draft)}/enviar`, f.body(draft)],
  ]) {
    await errorCode(await person.client.post(path, body, { Origin: 'https://example.test' }), 403);
    await errorCode(await f.client().post(path, body), 401);
  }
  expectStatus(await f.ana.client.get(f.submissionPath(draft)), 200);
  assert.deepEqual(await f.counts(draft), { ledger: 0, events: 0, outbox: 0, conversations: 0 });
});
