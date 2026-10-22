import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { reviewFixture, closeRuntime } from './helpers.mjs';
import { errorCode, expectStatus } from '../helpers/http-client.mjs';

after(closeRuntime);

test('análise, operação e histórico isolam participante, outra loja e admin sem bypass', async t => {
  const f = await reviewFixture(t);
  const record = await f.received();
  const body = await f.reviewBody(record, 'CONTEST');
  const decision = await f.decide(record, 'CONTEST', { operationId: body.operationId });
  const responseBody = await f.responseBody(record);
  const otherOwner = await f.user();
  const otherStore = await f.createStore(otherOwner, 'Outra loja T08 fictícia');
  await f.addMembership(otherStore, otherOwner, 'MERCHANT');
  const admin = await f.user();
  await f.database.query('INSERT INTO app."AdminGrant" ("profileId") VALUES ($1)', [admin.id]);
  for (const person of [f.ana, f.bia, otherOwner, admin]) {
    await errorCode(await person.client.post(`${f.submissionPath(record)}/analise`, body), 404);
  }
  for (const person of [f.bia, otherOwner, admin]) {
    for (const suffix of ['/historico', `/operacoes/${decision.event.id}`]) {
      await errorCode(await person.client.get(`${f.submissionPath(record)}${suffix}`), 404);
    }
    await errorCode(await person.client.post(`${f.submissionPath(record)}/resposta`, responseBody), 404);
  }
  await errorCode(await f.owner.client.post(`${f.submissionPath(record)}/resposta`, responseBody), 404);
  await errorCode(await f.owner.client.get(`${f.submissionPath(record, otherStore)}/historico`), 404);
  await errorCode(await f.owner.client.get(`${f.submissionPath(record)}/operacoes/${randomUUID()}`), 404);
  expectStatus(await f.ana.client.get(`${f.submissionPath(record)}/operacoes/${decision.event.id}`), 200);
  assert.deepEqual(await f.counts(record), { ledger: 0, reviews: 1, outbox: 1 });
});

test('origem, cookie e no-store protegem decisões e complementos sem consumo de versão', async t => {
  const f = await reviewFixture(t);
  const record = await f.received();
  const reviewBody = await f.reviewBody(record, 'CONTEST');
  const reviewPath = `${f.submissionPath(record)}/analise`;
  await errorCode(await f.owner.client.post(reviewPath, reviewBody, { Origin: 'https://example.test' }), 403);
  await errorCode(await f.client().post(reviewPath, reviewBody), 401);
  const contested = await f.decide(record, 'CONTEST');
  const responseBody = await f.responseBody(record);
  const responsePath = `${f.submissionPath(record)}/resposta`;
  await errorCode(await f.ana.client.post(responsePath, responseBody, { Origin: 'https://example.test' }), 403);
  await errorCode(await f.client().post(responsePath, responseBody), 401);
  for (const path of [`${f.submissionPath(record)}/historico`,
    `${f.submissionPath(record)}/operacoes/${contested.event.id}`, `${f.base()}/pontos/movimentos`]) {
    expectStatus(await f.ana.client.get(path), 200); await errorCode(await f.client().get(path), 401);
  }
  assert.equal((await f.latest(record)).analysis.version, 1);
  assert.deepEqual(await f.counts(record), { ledger: 0, reviews: 1, outbox: 1 });
});

test('revogação de acesso e suspensão prevalecem sobre replay e links já conhecidos', async t => {
  const f = await reviewFixture(t);
  const record = await f.received(); await f.decide(record, 'CONTEST');
  const response = await f.respond(record);
  await f.database.query('UPDATE app."Membership" SET "accessRevokedAt"=now() WHERE id=$1', [f.participation.id]);
  for (const suffix of ['/historico', `/operacoes/${response.event.id}`]) {
    await errorCode(await f.ana.client.get(`${f.submissionPath(record)}${suffix}`), 404);
  }
  await errorCode(await f.ana.client.post(`${f.submissionPath(record)}/resposta`, response.request), 404);
  await errorCode(await f.ana.client.get(`${f.base()}/pontos/movimentos`), 404);
  const another = await f.received({ name: 'Registro da Bia' }, f.bia);
  const body = await f.reviewBody(another, 'APPROVE');
  await f.database.query('UPDATE app."Profile" SET "suspendedAt"=now() WHERE id=$1', [f.owner.id]);
  const denied = await f.owner.client.post(`${f.submissionPath(another)}/analise`, body);
  assert.ok([401, 403].includes(denied.status));
  const content = await denied.text(); assert.doesNotMatch(content, /Registro da Bia|Uma conquista de teste/);
  assert.deepEqual(await f.counts(another), { ledger: 0, reviews: 0, outbox: 0 });
});
