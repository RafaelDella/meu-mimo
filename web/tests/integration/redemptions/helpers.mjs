import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { reviewFixture } from '../points/helpers.mjs';
import { expectStatus } from '../helpers/http-client.mjs';

export { closeRuntime, deliver } from '../points/helpers.mjs';

export const rewardFields = (extra = {}) => ({ name: 'Um mimo de integração',
  description: 'Uma ocasião para combinar.', category: 'A dois', sticker: 'gift',
  cost: 10, note: 'Um recadinho compartilhado.', instructions: 'Conversem no ticket.',
  available: true, stock: null, ...extra });

export async function redemptionFixture(t) {
  const f = await reviewFixture(t);
  const rewardPath = (reward, store = f.store) => `${f.base(store)}/mimos/${reward.id}`;
  const ticketPath = (ticket, store = f.store) => `${f.base(store)}/tickets/${ticket.id}`;
  async function createReward(extra = {}, person = f.owner, store = f.store, operationId = randomUUID()) {
    const request = { operationId, ...rewardFields(extra) };
    const response = await person.client.post(`${f.base(store)}/mimos`, request);
    expectStatus(response, 201);
    return { ...(await response.json()).reward, request };
  }
  const rewardBody = (reward, extra = {}) => ({ operationId: randomUUID(),
    expectedVersion: reward.version, expectedStockRevision: reward.stockRevision,
    ...Object.fromEntries(Object.keys(rewardFields()).map(key => [key, reward[key]])), ...extra });
  async function updateReward(reward, extra = {}) {
    const request = rewardBody(reward, extra);
    const response = await f.owner.client.patch(rewardPath(reward), request);
    expectStatus(response, 200);
    return { ...(await response.json()).reward, request };
  }
  const archiveBody = reward => ({ operationId: randomUUID(), expectedVersion: reward.version,
    expectedStockRevision: reward.stockRevision });
  async function archiveReward(reward) {
    const request = archiveBody(reward);
    const response = await f.owner.client.post(`${rewardPath(reward)}/arquivar`, request);
    expectStatus(response, 200);
    return { ...(await response.json()).reward, request };
  }
  const preview = (reward, person = f.ana) => f.read(person, rewardPath(reward));
  async function redemptionBody(reward, person = f.ana, extra = {}) {
    const current = await preview(reward, person);
    return { operationId: randomUUID(), expectedVersion: current.version,
      expectedBalance: current.availability.available, ...extra };
  }
  async function redeem(reward, person = f.ana, extra = {}) {
    const request = await redemptionBody(reward, person, extra);
    const response = await person.client.post(`${rewardPath(reward)}/resgatar`, request);
    expectStatus(response, 200);
    return { ...(await response.json()).ticket, request };
  }
  async function credit(points = 15, person = f.ana) {
    const record = await f.received({ points, name: `Crédito real T09 ${points}`, approvalMode: 'MANUAL' }, person);
    await f.decide(record, 'APPROVE');
    return record;
  }
  const ticket = (record, person = f.ana) => f.read(person, ticketPath(record));
  const lookup = (reward, id, person = f.ana) => f.read(person, `${rewardPath(reward)}/operacoes/${id}`);
  const tickets = (query = '', person = f.ana) => f.read(person, `${f.base()}/tickets${query}`);
  const summary = (query = '', person = f.ana) => f.read(person, `${f.base()}/tickets/resumo${query}`);
  const rewardRow = reward => f.database.query('SELECT * FROM app."Reward" WHERE id=$1', [reward.id]).then(result => result.rows[0]);
  async function emissionCounts(id) {
    return (await f.database.query(`SELECT
      (SELECT count(*)::int FROM app."Redemption" WHERE id=$1) AS tickets,
      (SELECT count(*)::int FROM app."RedemptionEvent" WHERE "redemptionId"=$1) AS events,
      (SELECT count(*)::int FROM app."PointsEntry" WHERE "redemptionId"=$1) AS ledger,
      (SELECT count(*)::int FROM app."Conversation" WHERE "subjectType"='TICKET' AND "subjectId"=$1) AS conversations,
      (SELECT count(*)::int FROM app."OutboxEvent" WHERE "redemptionId"=$1) AS outbox`, [id])).rows[0];
  }
  const emissionLedger = id => f.database.query(`SELECT *, amount::text FROM app."PointsEntry"
    WHERE "redemptionId"=$1`, [id]).then(result => result.rows);
  async function withEmissionFailure(table, request, reward, work) {
    const expressions = {
      Redemption: `id <> '${request.operationId}'::uuid`,
      RedemptionEvent: `"redemptionId" IS DISTINCT FROM '${request.operationId}'::uuid`,
      PointsEntry: `"redemptionId" IS DISTINCT FROM '${request.operationId}'::uuid`,
      OutboxEvent: `"redemptionId" IS DISTINCT FROM '${request.operationId}'::uuid`,
      Conversation: `"subjectType" <> 'TICKET' OR "subjectId" <> '${request.operationId}'::uuid`,
      Reward: `id <> '${reward.id}'::uuid OR stock IS NOT DISTINCT FROM ${reward.stock}`,
    };
    assert.ok(Object.hasOwn(expressions, table));
    const name = `t09_failure_${randomUUID().replaceAll('-', '')}`;
    await f.database.query(`ALTER TABLE app."${table}" ADD CONSTRAINT "${name}" CHECK (${expressions[table]})`);
    try { return await work(); }
    finally { await f.database.query(`ALTER TABLE app."${table}" DROP CONSTRAINT "${name}"`); }
  }
  async function withCatalogFailure(table, operationId, work) {
    assert.ok(['Reward', 'RewardEvent'].includes(table));
    const name = `t09_catalog_${randomUUID().replaceAll('-', '')}`;
    await f.database.query(`ALTER TABLE app."${table}" ADD CONSTRAINT "${name}" CHECK (id <> '${operationId}'::uuid)`);
    try { return await work(); }
    finally { await f.database.query(`ALTER TABLE app."${table}" DROP CONSTRAINT "${name}"`); }
  }
  async function withEmissionClock(instant, work) {
    assert.ok(Number.isFinite(Date.parse(instant)));
    const name = `t09_clock_${randomUUID().replaceAll('-', '')}`;
    // Somente o relógio da emissão muda. Todos os registros continuam vindo da API real.
    await f.database.query(`CREATE FUNCTION app."${name}"() RETURNS trigger LANGUAGE plpgsql AS $body$
      BEGIN IF NEW."storeId"='${f.store.id}'::uuid THEN
        IF TG_TABLE_NAME='PointsEntry' THEN
          IF NEW."redemptionId" IS NULL THEN RETURN NEW; END IF;
        END IF;
        NEW."createdAt"='${new Date(instant).toISOString()}'::timestamptz;
        IF TG_TABLE_NAME='Redemption' THEN
          NEW."localDate"=to_char(NEW."createdAt" AT TIME ZONE NEW.timezone,'YYYY-MM-DD');
        END IF;
      END IF; RETURN NEW; END $body$`);
    const installed = [];
    try {
      for (const table of ['Redemption', 'RedemptionEvent', 'PointsEntry']) {
        await f.database.query(`CREATE TRIGGER "${name}" BEFORE INSERT ON app."${table}"
          FOR EACH ROW EXECUTE FUNCTION app."${name}"()`);
        installed.push(table);
      }
      try { return await work(); }
      finally { for (const table of installed.splice(0)) await f.database.query(`DROP TRIGGER "${name}" ON app."${table}"`); }
    } finally {
      for (const table of installed) await f.database.query(`DROP TRIGGER "${name}" ON app."${table}"`);
      await f.database.query(`DROP FUNCTION app."${name}"()`);
    }
  }
  return { ...f, rewardPath, ticketPath, createReward, rewardBody, updateReward, archiveBody,
    archiveReward, preview, redemptionBody, redeem, credit, ticket, lookup, tickets, summary,
    rewardRow, emissionCounts, emissionLedger, withEmissionFailure, withCatalogFailure, withEmissionClock };
}

export const emittedOnce = { tickets: 1, events: 1, ledger: 1, conversations: 1, outbox: 1 };
export const noEmission = { tickets: 0, events: 0, ledger: 0, conversations: 0, outbox: 0 };
