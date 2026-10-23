import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { relationshipFixture, closeRuntime, deliver } from './helpers.mjs';
import { errorCode, expectStatus } from '../helpers/http-client.mjs';
after(closeRuntime);

async function transition(f, ticket, action, extra = {}) {
  const current = await f.ticket(ticket, f.owner);
  const request = { operationId: randomUUID(), expectedVersion: current.version, action,
    ...(action === 'FULFILL' ? {} : { text: 'Decisão real do painel' }),
    ...(action === 'CANCEL' ? { expectedBalance: current.cancellationImpact.balanceBefore, restock: false } : {}), ...extra };
  const response = await f.owner.client.post(`${f.ticketPath(ticket)}/transicoes`, request);
  expectStatus(response, 200); return response.json();
}

test('painéis vazios têm saldo real, checklist derivado e identidade da própria relação', async t => {
  const f = await relationshipFixture(t);
  expectStatus(await f.owner.client.patch('/api/perfil', { displayName: 'Quem preparou a loja' }), 200);
  expectStatus(await f.ana.client.patch('/api/perfil', { displayName: 'Ana da relação' }), 200);
  const merchant = await f.dashboard();
  assert.deepEqual(merchant.counts, { pendingSubmissions: 0, outstandingTickets: 0, activeParticipants: 2 });
  assert.deepEqual(Object.fromEntries(merchant.checklist.map(item => [item.key, item.done])),
    { PRESENTATION: false, ACTIVITY: false, REWARD: false, INVITATION: true });
  assert.deepEqual(merchant.pending, []); assert.deepEqual(merchant.tickets, []); assert.deepEqual(merchant.recent, []);
  const participant = await f.dashboard(f.ana);
  assert.equal(participant.person.displayName, 'Ana da relação');
  assert.equal(participant.merchant.displayName, 'Quem preparou a loja');
  assert.equal(participant.points.available, '0'); assert.equal(participant.points.pending, '0');
  assert.deepEqual(participant.activities, []); assert.deepEqual(participant.rewards, []);
  assert.deepEqual(participant.tickets, { total: 0, outstanding: 0 });
  assert.deepEqual(participant.note, { current: null, writable: false, unread: false });
  assert.equal(JSON.stringify(participant).includes(f.otherParticipation.id), false);
  await errorCode(await f.ana.client.get(`${f.base()}/resumo`), 404);
  await errorCode(await f.owner.client.get(`${f.base()}/lojinha`), 404);
});

test('checklist acompanha apresentação, catálogo ativo e arquivo sem inventar conclusões', async t => {
  const f = await relationshipFixture(t);
  const store = await f.createStore(f.owner, 'Início vazio'); await f.addMembership(store, f.owner, 'MERCHANT');
  const current = () => f.read(`${f.base(store)}/resumo`);
  assert.ok((await current()).checklist.every(item => item.done === false));
  expectStatus(await f.owner.client.patch(f.base(store), { presentation: 'Um lugar preparado com carinho.' }), 200);
  const activity = await f.create({}, f.owner, store); const reward = await f.createReward({}, f.owner, store);
  let checklist = Object.fromEntries((await current()).checklist.map(item => [item.key, item.done]));
  assert.deepEqual(checklist, { PRESENTATION: true, ACTIVITY: true, REWARD: true, INVITATION: false });
  expectStatus(await f.owner.client.post(`${f.activityPath(activity, store)}/arquivar`, {
    operationId: randomUUID(), expectedVersion: activity.version,
  }), 200);
  expectStatus(await f.owner.client.post(`${f.rewardPath(reward, store)}/arquivar`, f.archiveBody(reward)), 200);
  checklist = Object.fromEntries((await current()).checklist.map(item => [item.key, item.done]));
  assert.equal(checklist.ACTIVITY, false); assert.equal(checklist.REWARD, false);
});

test('limites6/3/5 resumem listas reais e incluem PENDING e CONTESTED no trabalho', async t => {
  const f = await relationshipFixture(t); await f.credit(100);
  const pending = [];
  for (let index = 0; index < 4; index++) {
    await f.resetLimits(); pending.push(await f.received({ name: `Análise ${index}` }));
  }
  await f.decide(pending[1], 'CONTEST');
  for (let index = 0; index < 7; index++) {
    await f.resetLimits(); await f.create({ name: `Atividade ${index}` });
    await f.createReward({ name: `Mimo ${index}`, cost: 1, category: `Categoria ${index}` });
  }
  const reward = await f.createReward({ cost: 1 });
  for (let index = 0; index < 4; index++) { await f.resetLimits(); await f.redeem(reward); }
  await deliver();
  const merchant = await f.dashboard(); const participant = await f.dashboard(f.ana);
  assert.equal(merchant.counts.pendingSubmissions, 4); assert.equal(merchant.counts.outstandingTickets, 4);
  assert.equal(merchant.pending.length, 3); assert.equal(merchant.tickets.length, 3); assert.equal(merchant.recent.length, 5);
  assert.deepEqual(new Set(merchant.pending.map(item => item.status)), new Set(['PENDING', 'CONTESTED']));
  assert.equal(participant.activities.length, 6); assert.equal(participant.rewards.length, 6);
  assert.ok(participant.categories.includes('Categoria 0')); assert.ok(participant.categories.includes('Categoria 6'));
  const person = await f.read(`${f.base()}/participacoes/${f.participation.id}/resumo`);
  assert.equal(person.pendingSubmissions, 4); assert.equal(person.outstandingTickets, 4); assert.equal(person.recent.length, 5);
  assert.equal(person.points.available, '96'); assert.equal(person.points.pending, '60');
});

test('ticket pendente de participação encerrada continua no painel sem contar como pessoa ativa', async t => {
  const f = await relationshipFixture(t); await f.credit(30);
  const reward = await f.createReward(); const first = await f.redeem(reward); const second = await f.redeem(reward);
  await transition(f, second, 'AGREE', { agreementDate: null });
  expectStatus(await f.owner.client.post(`${f.base()}/participacoes/${f.participation.id}/encerrar`, {}), 200);
  let dashboard = await f.dashboard();
  assert.equal(dashboard.counts.activeParticipants, 1); assert.equal(dashboard.counts.outstandingTickets, 2);
  assert.deepEqual(new Set(dashboard.tickets.map(item => item.id)), new Set([first.id, second.id]));
  await transition(f, first, 'FULFILL');
  dashboard = await f.dashboard();
  assert.equal(dashboard.counts.outstandingTickets, 1); assert.equal(dashboard.tickets[0].status, 'AGREED');
  const person = await f.read(`${f.base()}/participacoes/${f.participation.id}/resumo`);
  assert.ok(person.person.closedAt); assert.equal(person.outstandingTickets, 1);
});

test('economia15→resgate10→anulação−15→devolução10 termina0 sem transformar refund em ganho diário', async t => {
  const f = await relationshipFixture(t); const record = await f.credit(15);
  const reward = await f.createReward({ cost: 10 });
  assert.equal((await f.dashboard(f.ana)).points.available, '15');
  const ticket = await f.redeem(reward);
  assert.equal((await f.dashboard(f.ana)).points.available, '5');
  await f.decide(record, 'VOID');
  const negative = await f.dashboard(f.ana);
  assert.equal(negative.points.available, '-10'); assert.equal(negative.points.today.credited, '15');
  assert.equal(negative.points.today.adjusted, '-15');
  await transition(f, ticket, 'CANCEL');
  const participant = await f.dashboard(f.ana);
  assert.equal(participant.points.available, '0'); assert.equal(participant.points.today.credited, '15');
  assert.equal(participant.points.today.adjusted, '-15'); assert.equal(participant.points.today.approved, 1);
  assert.deepEqual(participant.tickets, { total: 1, outstanding: 0 });
  assert.deepEqual(participant.points, await f.balance());
  const ledger = (await f.database.query('SELECT kind,amount::text FROM app."PointsEntry" WHERE "storeId"=$1 ORDER BY "createdAt",id', [f.store.id])).rows;
  assert.deepEqual(ledger.map(row => [row.kind, row.amount]), [
    ['ACTIVITY_CREDIT', '15'], ['REDEMPTION_DEBIT', '-10'], ['ACTIVITY_REVERSAL', '-15'], ['REDEMPTION_REFUND', '10'],
  ]);
});

test('acontecimentos exigem entrega e não expõem texto de bilhete ou recibo ao lojista', async t => {
  const f = await relationshipFixture(t);
  const secret = 'Conteúdo exclusivo do bilhete de Ana'; const sent = await f.send(secret);
  assert.deepEqual((await f.dashboard()).recent, []);
  await deliver();
  const beforeRead = (await f.dashboard()).recent;
  assert.equal(beforeRead.length, 1); assert.equal(beforeRead[0].kind, 'NOTE_SENT');
  assert.ok(beforeRead[0].path.includes(sent.applied.id));
  await f.mark(sent.applied);
  const merchant = await f.dashboard();
  assert.deepEqual(merchant.recent, beforeRead);
  const events = await f.read(`${f.base()}/resumo/acontecimentos?pageSize=1`);
  assert.equal(events.total, 1); assert.equal(events.items.length, 1);
  for (const value of [merchant, events]) {
    const serialized = JSON.stringify(value);
    assert.equal(serialized.includes(secret), false); assert.equal(serialized.includes('readAt'), false);
    assert.equal(serialized.includes('unread'), false);
  }
  const person = await f.read(`${f.base()}/participacoes/${f.participation.id}/resumo`);
  assert.deepEqual(Object.keys(person.note).sort(), ['current', 'writable']);
  await errorCode(await f.ana.client.get(`${f.base()}/participacoes/${f.otherParticipation.id}/resumo`), 404);
  assert.equal((await f.dashboard(f.bia)).note.current, null);
});

test('falha na consulta financeira retorna503 sem apresentar um saldo zero de sucesso', async t => {
  const f = await relationshipFixture(t); await f.credit(15);
  const before = await f.financial();
  const acl = () => f.database.query(`SELECT a.grantor::regrole::text AS grantor,a.grantee::regrole::text AS grantee,
    a.privilege_type,a.is_grantable,current_user AS operator FROM pg_class c,
    LATERAL aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) a
    WHERE c.oid='app."PointsEntry"'::regclass ORDER BY grantor,grantee,privilege_type`);
  const original = (await acl()).rows;
  const permission = original.filter(row => row.grantee === 'meumimo_runtime' && row.privilege_type === 'SELECT');
  assert.equal(permission.length, 1); assert.equal(permission[0].grantor, permission[0].operator);
  await f.database.query('REVOKE SELECT ON app."PointsEntry" FROM meumimo_runtime');
  try {
    const body = await errorCode(await f.ana.client.get(`${f.base()}/lojinha`), 503);
    assert.equal(Object.hasOwn(body, 'points'), false);
    assert.equal(Object.hasOwn(body, 'available'), false);
  } finally {
    await f.database.query(`GRANT SELECT ON app."PointsEntry" TO meumimo_runtime${permission[0].is_grantable ? ' WITH GRANT OPTION' : ''}`);
  }
  assert.deepEqual((await acl()).rows, original);
  assert.equal((await f.dashboard(f.ana)).points.available, '15');
  assert.deepEqual(await f.financial(), before);
});
