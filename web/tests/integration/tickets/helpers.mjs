import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { redemptionFixture } from '../redemptions/helpers.mjs';
import { expectStatus } from '../helpers/http-client.mjs';

export { closeRuntime, deliver } from '../redemptions/helpers.mjs';

export async function ticketFixture(t, { stock = 2, points = 30 } = {}) {
  const f = await redemptionFixture(t);
  const credit = await f.credit(points);
  const reward = await f.createReward({ stock });
  const issued = await f.redeem(reward);
  const transitionPath = ticket => `${f.ticketPath(ticket)}/transicoes`;
  async function transitionBody(ticket, action, extra = {}) {
    const current = await f.ticket(ticket, f.owner);
    const body = { operationId: randomUUID(), expectedVersion: current.version, action };
    if (action !== 'FULFILL') body.text = 'Um combinado ou motivo de integração T10.';
    if (action === 'AGREE') body.agreementDate = null;
    if (action === 'CANCEL') {
      body.expectedBalance = current.cancellationImpact.balanceBefore;
      body.restock = false;
      if (extra.restock) body.expectedStockRevision = current.cancellationImpact.restock.stockRevision;
    }
    return { ...body, ...extra };
  }
  async function transition(ticket, action, extra = {}, person = action === 'REQUEST_CANCELLATION' ? f.ana : f.owner) {
    const request = await transitionBody(ticket, action, extra);
    const response = await person.client.post(transitionPath(ticket), request);
    expectStatus(response, 200);
    return { ...(await response.json()), request };
  }
  const operation = (ticket, id, person = f.owner) =>
    f.read(person, `${f.ticketPath(ticket)}/operacoes/${id}`);
  const events = (ticket, query = '', person = f.ana) =>
    f.read(person, `${f.ticketPath(ticket)}/eventos${query}`);
  const rows = ticket => f.database.query(`SELECT id,kind,amount::text,"compensatesEntryId","redemptionEventId"
    FROM app."PointsEntry" WHERE "redemptionId"=$1 ORDER BY "createdAt",id`, [ticket.id]).then(result => result.rows);
  async function failure(table, request, work) {
    assert.ok(['Redemption', 'RedemptionEvent', 'PointsEntry', 'Reward', 'OutboxEvent'].includes(table));
    const name = `t10_failure_${randomUUID().replaceAll('-', '')}`;
    const expression = table === 'Redemption' ? `id <> '${issued.id}'::uuid OR version=${request.expectedVersion}` :
      table === 'Reward' ? `id <> '${reward.id}'::uuid OR stock=${stock - 1}` :
      table === 'RedemptionEvent' ? `id <> '${request.operationId}'::uuid` :
      `"redemptionEventId" IS DISTINCT FROM '${request.operationId}'::uuid`;
    await f.database.query(`ALTER TABLE app."${table}" ADD CONSTRAINT "${name}" CHECK (${expression})`);
    try { return await work(); }
    finally { await f.database.query(`ALTER TABLE app."${table}" DROP CONSTRAINT "${name}"`); }
  }
  return { ...f, creditRecord: credit, reward, issued, transitionPath, transitionBody,
    transition, operation, events, ticketLedger: rows, transitionFailure: failure };
}
