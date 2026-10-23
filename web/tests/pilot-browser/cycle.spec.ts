import { expect, test } from '@playwright/test';
import type { BrowserContext } from '@playwright/test';
import { pilotFixture, personPage, createStore, invite, createActivity, submitRecord, review,
  redeem, transition, closeContexts } from './helpers';
import { noHorizontalOverflow, waitForDomainBudget } from './helper-auth';
import { createCycleReward, cancelCycleTicketWithRestock, editRewardAndVerifySnapshot, publishCycleAlbum } from './helper-cycle';

test('ciclo web real reconcilia crédito, resgate, saldo negativo, devolução e memórias', async ({ browser }) => {
  test.setTimeout(720_000);
  const f = await pilotFixture(); const contexts: BrowserContext[] = [];
  try {
    const people = await Promise.all([f.createUser(), f.createUser(), f.createUser()]);
    const owner = await personPage(browser, people[0]); contexts.push(owner.context);
    await owner.page.setViewportSize({ width: 1280, height: 900 });
    const ana = await personPage(browser, people[1]); contexts.push(ana.context);
    const bia = await personPage(browser, people[2]); contexts.push(bia.context);
    const paceOwner = () => waitForDomainBudget(f.database, people[0].id);
    const storeId = await createStore(owner.page, f.trackStore);
    await invite(owner.page, ana.page, storeId); await invite(owner.page, bia.page, storeId);
    await noHorizontalOverflow(owner.page); await noHorizontalOverflow(ana.page); await noHorizontalOverflow(bia.page);
    const activityId = await createActivity(owner.page, storeId);
    await paceOwner(); await owner.page.goto(`/lojas/${storeId}/atividades/${activityId}/editar`);
    await owner.page.getByLabel('Nome da atividade', { exact: true }).fill('Conquista revisada na web');
    await owner.page.getByRole('button', { name: 'Salvar atividade', exact: true }).click();
    await expect(owner.page).toHaveURL(`/lojas/${storeId}/atividades/${activityId}`);
    expect((await f.database.query('SELECT name,points FROM app."Activity" WHERE id=$1 AND "storeId"=$2', [activityId, storeId])).rows)
      .toEqual([{ name: 'Conquista revisada na web', points: 15 }]);
    const recordId = await submitRecord(ana.page, storeId, activityId, true);
    await review(owner.page, storeId, recordId, 'Aprovar registro');
    const reward = await createCycleReward(owner.page, storeId); const rewardId = reward.id;
    const ticketId = await redeem(ana.page, storeId, rewardId);
    await paceOwner();
    await review(owner.page, storeId, recordId, 'Anular registro');
    const balance = async () => (await f.database.query(`SELECT COALESCE(sum(p.amount),0)::text balance FROM app."PointsEntry" p
      JOIN app."Membership" m ON m.id=p."participantMembershipId" WHERE m."profileId"=$1 AND p."storeId"=$2`, [people[1].id, storeId])).rows[0].balance;
    expect(await balance()).toBe('-10');
    await ana.page.goto(`/lojas/${storeId}/tickets/${ticketId}`);
    await expect(ana.page.getByRole('article', { name: 'Seu vale mimo', exact: true })).toBeVisible();
    await waitForDomainBudget(f.database, people[1].id, { read: 70, write: 5 });
    await transition(ana.page, storeId, ticketId, 'Pedir cancelamento', 'Enviar pedido de cancelamento', 'Motivo do pedido', 'Primeiro pedido após a anulação.');
    await paceOwner(); await transition(owner.page, storeId, ticketId, 'Recusar pedido', 'Confirmar recusa', 'Motivo da recusa');
    expect(await balance()).toBe('-10');
    await waitForDomainBudget(f.database, people[1].id, { read: 70, write: 5 });
    await transition(ana.page, storeId, ticketId, 'Pedir cancelamento', 'Enviar pedido de cancelamento', 'Motivo do pedido', 'Novo pedido após a recusa.');
    expect(await balance()).toBe('-10');
    await paceOwner(); await cancelCycleTicketWithRestock(f.database, owner.page, storeId, ticketId, rewardId);
    expect(await balance()).toBe('0');
    const ledger = (await f.database.query('SELECT amount::text FROM app."PointsEntry" WHERE "storeId"=$1 ORDER BY "createdAt",id', [storeId])).rows.map(row => row.amount);
    expect(ledger).toEqual(['15', '-10', '-15', '10']);
    await owner.page.reload(); expect(await balance()).toBe('0');

    // A segunda emissão preserva o snapshot após a edição real do catálogo.
    const secondRecord = await submitRecord(ana.page, storeId, activityId);
    await paceOwner();
    await review(owner.page, storeId, secondRecord, 'Aprovar registro');
    const secondTicket = await redeem(ana.page, storeId, rewardId);
    await paceOwner(); await waitForDomainBudget(f.database, people[1].id, { read: 70, write: 5 });
    await editRewardAndVerifySnapshot(f.database, owner.page, ana.page, storeId, secondTicket, reward);
    await paceOwner(); await transition(owner.page, storeId, secondTicket, 'Registrar combinado', 'Salvar combinado', 'Combinado', 'Combinado versão um.');
    await paceOwner(); await transition(owner.page, storeId, secondTicket, 'Revisar combinado', 'Salvar combinado', 'Combinado', 'Combinado revisado.');
    await paceOwner(); await transition(owner.page, storeId, secondTicket, 'Marcar realização', 'Confirmar realização');
    const membership = (await f.database.query('SELECT id FROM app."Membership" WHERE "storeId"=$1 AND "profileId"=$2',
      [storeId, people[1].id])).rows[0].id as string;
    await publishCycleAlbum({ database: f.database, auth: f.auth, owner: owner.page, participant: ana.page,
      ownerId: people[0].id, participantId: people[1].id, participantMembershipId: membership, storeId, ticketId: secondTicket });
    const denied = await bia.page.request.get(`/api/lojas/${storeId}/tickets/${secondTicket}`);
    expect(denied.status()).toBe(404);
    expect((await f.database.query(`SELECT count(*)::int n FROM app."OutboxEvent" WHERE "storeId"=$1 AND "processedAt" IS NOT NULL`, [storeId])).rows[0].n).toBeGreaterThan(0);
  } finally { await closeContexts(contexts); await f.cleanup(); }
});
