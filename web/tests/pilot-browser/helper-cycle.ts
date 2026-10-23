import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { Pool } from 'pg';
import type { SupabaseClient } from '@supabase/supabase-js';
import { fixtureFile, idFrom } from './helpers';
import { noHorizontalOverflow, waitForDomainBudget } from './helper-auth';

type RewardSnapshot = { id: string; name: string; cost: number; note: string };
type Asset = { id: string; state: string; failureCode: string | null; removedAt: Date | null;
  displayBytes: number | null; thumbnailBytes: number | null; outputVersion: string | null; mediaType: string };
type AlbumContext = { database: Pool; auth: SupabaseClient; owner: Page; participant: Page;
  ownerId: string; participantMembershipId: string; participantId: string; storeId: string; ticketId: string };

export async function createCycleReward(page: Page, storeId: string): Promise<RewardSnapshot> {
  const reward = { name: `Café da ocasião ${randomUUID().slice(0, 6)}`, cost: 10, note: 'Recadinho original do vale de dez pontos.' };
  await page.goto(`/lojas/${storeId}/mimos/novo`);
  await page.getByLabel('Nome do mimo', { exact: true }).fill(reward.name);
  await page.getByLabel('Custo em pontos', { exact: true }).fill(String(reward.cost));
  await page.getByLabel('Recadinho do catálogo', { exact: true }).fill(reward.note);
  await page.getByLabel('Estoque ilimitado', { exact: true }).uncheck();
  await page.getByLabel('Quantidade disponível agora', { exact: true }).fill('3');
  await page.getByRole('button', { name: 'Salvar mimo', exact: true }).click();
  await expect(page).toHaveURL(/\/mimos\/[a-f0-9-]{36}$/); return { id: idFrom(page, 'mimos'), ...reward };
}

export async function cancelCycleTicketWithRestock(database: Pool, owner: Page, storeId: string, ticketId: string, rewardId: string) {
  expect((await database.query('SELECT stock FROM app."Reward" WHERE id=$1 AND "storeId"=$2', [rewardId, storeId])).rows)
    .toEqual([{ stock: 2 }]);
  await owner.goto(`/lojas/${storeId}/tickets/${ticketId}`);
  await owner.getByRole('button', { name: 'Cancelar e devolver pontos', exact: true }).click();
  const dialog = owner.getByRole('dialog', { name: 'Cancelar e devolver pontos', exact: true });
  await dialog.getByLabel('Motivo do cancelamento', { exact: true }).fill('Segundo pedido confirmado com devolução e reposição explícita.');
  const restock = dialog.getByRole('checkbox', { name: 'Repor uma unidade no estoque', exact: true });
  await expect(restock).not.toBeChecked(); await restock.focus(); await owner.keyboard.press('Space');
  await expect(restock).toBeChecked();
  await dialog.getByRole('button', { name: 'Confirmar cancelamento e devolução', exact: true }).focus();
  await owner.keyboard.press('Enter'); await expect(dialog).toBeHidden();
  const events = (await database.query(`SELECT id,kind,"requestId" FROM app."RedemptionEvent"
    WHERE "redemptionId"=$1 AND "storeId"=$2 ORDER BY version`, [ticketId, storeId])).rows;
  expect(events.map(event => event.kind)).toEqual(['ISSUED', 'REQUEST_CANCELLATION', 'REJECT_CANCELLATION', 'REQUEST_CANCELLATION', 'CANCEL']);
  expect(events[2].requestId).toBe(events[1].id); expect(events[4].requestId).toBe(events[3].id);
  expect((await database.query(`SELECT delta::text,restocked,"stockBefore","stockAfter" FROM app."RedemptionEvent"
    WHERE "redemptionId"=$1 AND kind='CANCEL'`, [ticketId])).rows)
    .toEqual([{ delta: '10', restocked: true, stockBefore: 2, stockAfter: 3 }]);
  const debit = (await database.query(`SELECT id FROM app."PointsEntry" WHERE "redemptionId"=$1 AND kind='REDEMPTION_DEBIT'`, [ticketId])).rows;
  expect(debit).toHaveLength(1);
  expect((await database.query(`SELECT amount::text,"redemptionEventId","compensatesEntryId" FROM app."PointsEntry"
    WHERE "redemptionId"=$1 AND kind='REDEMPTION_REFUND'`, [ticketId])).rows)
    .toEqual([{ amount: '10', redemptionEventId: events[4].id, compensatesEntryId: debit[0].id }]);
  expect((await database.query('SELECT stock FROM app."Reward" WHERE id=$1 AND "storeId"=$2', [rewardId, storeId])).rows)
    .toEqual([{ stock: 3 }]);
  expect((await database.query('SELECT status FROM app."Redemption" WHERE id=$1 AND "storeId"=$2', [ticketId, storeId])).rows)
    .toEqual([{ status: 'CANCELLED' }]);
  await expect(owner.getByRole('region', { name: 'Histórico deste ticket', exact: true })).toContainText('Uma unidade reposta no estoque.');
  await noHorizontalOverflow(owner);
}

export async function editRewardAndVerifySnapshot(database: Pool, owner: Page, participant: Page,
  storeId: string, ticketId: string, reward: RewardSnapshot) {
  const changed = { name: `Café atualizado ${randomUUID().slice(0, 6)}`, cost: 99, note: 'Recadinho novo, exclusivo do catálogo atualizado.' };
  await owner.goto(`/lojas/${storeId}/mimos/${reward.id}/editar`);
  await owner.getByLabel('Nome do mimo', { exact: true }).fill(changed.name);
  await owner.getByLabel('Custo em pontos', { exact: true }).fill(String(changed.cost));
  await owner.getByRole('textbox', { name: 'Recadinho do catálogo', exact: true }).fill(changed.note);
  await owner.getByRole('button', { name: 'Salvar mimo', exact: true }).focus(); await owner.keyboard.press('Enter');
  await expect(owner).toHaveURL(`/lojas/${storeId}/mimos/${reward.id}`);
  expect((await database.query('SELECT name,cost,note FROM app."Reward" WHERE id=$1 AND "storeId"=$2', [reward.id, storeId])).rows)
    .toEqual([changed]);
  expect((await database.query(`SELECT "rewardName","rewardCost","rewardNote" FROM app."Redemption"
    WHERE id=$1 AND "rewardId"=$2 AND "storeId"=$3`, [ticketId, reward.id, storeId])).rows)
    .toEqual([{ rewardName: reward.name, rewardCost: reward.cost, rewardNote: reward.note }]);
  await noHorizontalOverflow(owner);
  await participant.goto(`/lojas/${storeId}/tickets/${ticketId}`);
  for (let attempt = 0; attempt < 2; attempt++) {
    const ticket = participant.getByRole('article', { name: 'Seu vale mimo', exact: true });
    await expect(ticket.getByRole('heading', { name: reward.name, exact: true })).toBeFocused();
    await expect(ticket.getByText('10 pontos · Uma unidade', { exact: true })).toBeVisible();
    await expect(ticket.getByText(reward.note, { exact: true })).toBeVisible();
    await expect(ticket.getByText(changed.name, { exact: true })).toHaveCount(0);
    await expect(ticket.getByText(changed.note, { exact: true })).toHaveCount(0);
    await noHorizontalOverflow(participant);
    if (!attempt) await participant.reload();
  }
}

async function financial(database: Pool, storeId: string) {
  return (await database.query(`SELECT
    (SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM app."PointsEntry" p WHERE "storeId"=$1) ledger,
    (SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM app."Reward" r WHERE "storeId"=$1) rewards,
    (SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM app."Redemption" r WHERE "storeId"=$1) tickets,
    (SELECT jsonb_agg(to_jsonb(e) ORDER BY id) FROM app."RedemptionEvent" e WHERE "storeId"=$1) events`, [storeId])).rows[0];
}

async function assets(context: AlbumContext) {
  return (await context.database.query<Asset>(`SELECT m.id,m.state,m."failureCode",m."removedAt",m."displayBytes",
    m."thumbnailBytes",m."outputVersion",m."mediaType" FROM app."MediaAsset" m
    JOIN app."TicketAlbum" a ON a."collectionId"=m."collectionId"
    WHERE a."redemptionId"=$1 AND a."createdByProfileId"=$2 AND m."authorProfileId"=$2 AND a."storeId"=$3
    ORDER BY m."createdAt",m.id`, [context.ticketId, context.ownerId, context.storeId])).rows;
}

async function refreshReady(context: AlbumContext, expected: { active: number; ready: number; failed: number }, drafts: number) {
  await expect.poll(async () => {
    const active = (await assets(context)).filter(asset => asset.removedAt === null);
    return { active: active.length, ready: active.filter(asset => asset.state === 'READY' && asset.outputVersion &&
      (asset.displayBytes ?? 0) > 0 && (asset.thumbnailBytes ?? 0) > 0).length,
    failed: active.filter(asset => asset.state === 'FAILED' && asset.failureCode === 'file_invalid').length };
  }, { timeout: 120_000, intervals: [500, 1000, 2000], message: 'Aguardar o worker real apenas na coleção/autoria deste ticket.' }).toEqual(expected);
  await waitForDomainBudget(context.database, context.ownerId, { read: 100, write: 5 });
  await context.owner.getByRole('button', { name: 'Atualizar arquivos', exact: true }).click();
  await expect(context.owner.getByRole('checkbox', { name: /Selecionar momento \d+ para publicar/ })).toHaveCount(drafts);
}

async function publish(context: AlbumContext, count: number, offset: number) {
  const page = context.owner;
  for (let index = 1; index <= count; index++) {
    await page.getByRole('checkbox', { name: `Selecionar momento ${index} para publicar`, exact: true }).check();
    await page.getByLabel(`Legenda do momento ${index}`, { exact: true }).fill(`Memória ${offset + index} do aceite local.`);
  }
  await waitForDomainBudget(context.database, context.ownerId, { read: 80, write: 3 });
  const trigger = page.getByRole('button', { name: `Publicar ${count} momentos prontos`, exact: true });
  await trigger.focus(); await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Confirmar publicação dos momentos?', exact: true });
  await expect(dialog).toBeVisible();
  const close = dialog.getByRole('button', { name: 'Fechar', exact: true });
  const confirm = dialog.getByRole('button', { name: 'Confirmar publicação', exact: true });
  await close.focus(); await page.keyboard.press('Shift+Tab'); await expect(confirm).toBeFocused();
  await page.keyboard.press('Tab'); await expect(close).toBeFocused();
  await page.keyboard.press('Escape'); await expect(dialog).toBeHidden(); await expect(trigger).toBeFocused();
  await page.keyboard.press('Enter'); await expect(dialog).toBeVisible();
  await confirm.focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('listitem', { name: /Momento publicado \d+$/ })).toHaveCount(offset + count);
}

async function participantAlbum(context: AlbumContext, total: number) {
  await waitForDomainBudget(context.database, context.participantId, { read: 70, write: 0 });
  await context.participant.goto(`/lojas/${context.storeId}/tickets/${context.ticketId}`);
  await expect(context.participant.getByRole('listitem', { name: /Momento publicado \d+$/ })).toHaveCount(total);
  for (let index = 1; index <= total; index++) await expect(context.participant.getByRole('listitem',
    { name: `Momento publicado ${index}`, exact: true }).getByText(`Memória ${index} do aceite local.`, { exact: true })
    .filter({ visible: true })).toBeVisible();
  await noHorizontalOverflow(context.participant);
}

export async function publishCycleAlbum(context: AlbumContext) {
  const { owner, database, storeId, ticketId } = context;
  const before = await financial(database, storeId);
  await waitForDomainBudget(database, context.ownerId, { read: 90, write: 25 });
  await owner.goto(`/lojas/${storeId}/tickets/${ticketId}`);
  await owner.getByRole('button', { name: 'Adicionar momentos', exact: true }).click();
  const brokenName = 'video-invalido-do-aceite.mp4';
  const files = await Promise.all(['photo.png', 'photo.webp', 'photo-gps-orientation.jpg', 'video.mp4'].map(async name => ({
    name, mimeType: name.endsWith('.png') ? 'image/png' : name.endsWith('.webp') ? 'image/webp' : name.endsWith('.jpg') ? 'image/jpeg' : 'video/mp4',
    buffer: await readFile(fixtureFile(name)),
  })));
  files.push({ name: brokenName, mimeType: 'video/mp4', buffer: Buffer.from('Payload sintético que não é um arquivo MP4.') });
  await owner.locator('input[type=file][aria-label="Escolher arquivos da galeria"]').setInputFiles(files);
  await owner.getByRole('button', { name: 'Enviar arquivos selecionados', exact: true }).click();
  await refreshReady(context, { active: 5, ready: 4, failed: 1 }, 4);
  const initial = await assets(context); const ready = initial.filter(asset => asset.state === 'READY');
  const broken = initial.find(asset => asset.state === 'FAILED' && asset.failureCode === 'file_invalid'); expect(broken).toBeDefined();
  const row = owner.getByRole('list', { name: 'Arquivos selecionados e enviados', exact: true })
    .getByRole('listitem', { name: brokenName, exact: true });
  await expect(row.getByText('Este arquivo não pôde ser processado. Remova-o e escolha outro compatível.', { exact: true })).toBeVisible();
  expect((await database.query(`SELECT count(*)::int n FROM app."AlbumItem" i JOIN app."TicketAlbum" a ON a.id=i."albumId"
    WHERE a."redemptionId"=$1`, [ticketId])).rows[0].n).toBe(0);
  // A ordem revisada também precisa sobreviver à publicação real.
  await owner.getByRole('button', { name: 'Mover momento 1 depois', exact: true }).click();
  const ordered = [ready[1].id, ready[0].id, ready[2].id, ready[3].id];
  await publish(context, 4, 0); await participantAlbum(context, 4);
  const target = `/api/lojas/${storeId}/midia/arquivos/${broken!.id}`;
  expect((await context.participant.request.get(target)).status()).toBe(404);
  expect((await context.participant.request.post(`${target}/acesso`, { data: { variant: 'display' },
    headers: { Origin: new URL(context.participant.url()).origin } })).status()).toBe(404);
  expect((await database.query('SELECT 1 FROM app."AlbumItem" WHERE "assetId"=$1', [broken!.id])).rowCount).toBe(0);

  await waitForDomainBudget(database, context.ownerId, { read: 90, write: 8 });
  const remove = row.getByRole('button', { name: 'Remover arquivo', exact: true });
  await remove.focus(); await owner.keyboard.press('Enter');
  const discard = owner.getByRole('dialog', { name: 'Descartar arquivo?', exact: true });
  await expect(discard).toBeVisible(); await owner.keyboard.press('Escape');
  await expect(discard).toBeHidden(); await expect(remove).toBeFocused();
  await owner.keyboard.press('Enter'); await discard.getByRole('button', { name: 'Confirmar remoção', exact: true }).click();
  await expect(row).toBeHidden();
  await expect.poll(async () => !!(await assets(context)).find(asset => asset.id === broken!.id)?.removedAt).toBe(true);
  const gallery = owner.locator('input[type=file][aria-label="Escolher arquivos da galeria"]');
  await expect(gallery).toBeEnabled(); await gallery.setInputFiles(fixtureFile('video-silent.mp4'));
  await owner.getByRole('button', { name: 'Enviar arquivos selecionados', exact: true }).click();
  await refreshReady(context, { active: 5, ready: 5, failed: 0 }, 1);
  const active = (await assets(context)).filter(asset => asset.removedAt === null);
  const replacement = active.find(asset => !ordered.includes(asset.id)); expect(replacement).toBeDefined();
  await publish(context, 1, 4); ordered.push(replacement!.id);
  await participantAlbum(context, 5); await noHorizontalOverflow(owner);
  const items = (await database.query(`SELECT i."assetId",i.position,i.caption,m."mediaType" FROM app."AlbumItem" i
    JOIN app."TicketAlbum" a ON a.id=i."albumId" JOIN app."MediaAsset" m ON m.id=i."assetId"
    WHERE a."redemptionId"=$1 AND a."createdByProfileId"=$2 ORDER BY i.position`, [ticketId, context.ownerId])).rows;
  expect(items.map(item => item.assetId)).toEqual(ordered);
  expect(items.map(item => item.position)).toEqual([1, 2, 3, 4, 5]);
  expect(items.map(item => item.caption)).toEqual(Array.from({ length: 5 }, (_, index) => `Memória ${index + 1} do aceite local.`));
  expect(items.filter(item => item.mediaType === 'VIDEO')).toHaveLength(2);
  const publications = async () => (await database.query(`SELECT e.id,
    (SELECT count(*)::int FROM app."AlbumItem" i WHERE i."publicationId"=e.id) AS items,
    (SELECT count(*)::int FROM app."OutboxEvent" o WHERE o."albumEventId"=e.id AND o.kind='ALBUM_PUBLISHED'
      AND o."recipientMembershipId"=$3 AND o."processedAt" IS NOT NULL) AS delivered,
    (SELECT count(*)::int FROM app."OutboxEvent" o WHERE o."albumEventId"=e.id) AS outbox,
    (SELECT count(*)::int FROM app."Notification" n JOIN app."OutboxEvent" o ON o.id=n."eventId" WHERE o."albumEventId"=e.id) AS notices
    FROM app."AlbumEvent" e WHERE e."redemptionId"=$1 AND e."actorProfileId"=$2 AND e.kind='PUBLISH' ORDER BY e.version`,
  [ticketId, context.ownerId, context.participantMembershipId])).rows;
  await expect.poll(async () => (await publications()).map(({ items, delivered, outbox, notices }) => ({ items, delivered, outbox, notices })),
    { timeout: 30_000, intervals: [500, 1000, 2000] }).toEqual([
    { items: 4, delivered: 1, outbox: 1, notices: 1 }, { items: 1, delivered: 1, outbox: 1, notices: 1 },
  ]);
  expect(await financial(database, storeId)).toEqual(before);
  for (const asset of active) {
    const object = `t14-integration/${asset.id}/${asset.outputVersion}/display.${asset.mediaType === 'PHOTO' ? 'jpg' : 'mp4'}`;
    const stored = await context.auth.storage.from('meumimo-t06-private').download(object);
    expect(stored.error).toBeNull(); expect(stored.data?.size).toBe(asset.displayBytes);
  }
}
