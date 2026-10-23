import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import { pilotFixture, personPage, createStore, invite, createActivity, submitRecord, closeContexts } from './helpers';
import { provisionAdmin, noHorizontalOverflow, waitForDomainBudget } from './helper-auth';

async function sendNote(page: Page, storeId: string, membershipId: string, text: string, version: number) {
  await page.goto(`/lojas/${storeId}/pessoas/${membershipId}`);
  await page.getByLabel('Texto do bilhete', { exact: true }).fill(text);
  await page.getByRole('button', { name: 'Conferir bilhete', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Conferir seu bilhete', exact: true });
  await expect(dialog.getByText(text, { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Enviar bilhete', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText(`Consultar bilhete atual · versão ${version}`, { exact: true })).toBeVisible();
}

async function privateImageURL(page: Page) {
  await page.getByRole('button', { name: 'Abrir arquivo', exact: true }).click();
  const image = page.getByRole('img', { name: 'Foto privada deste item', exact: true });
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate(node => (node as HTMLImageElement).complete && (node as HTMLImageElement).naturalWidth > 0)).toBe(true);
  const src = await image.getAttribute('src'); if (!src) throw new Error('A imagem autorizada não forneceu seu endereço.');
  const url = new URL(src, page.url()); expect(url.origin).toBe(new URL(page.url()).origin); return url.href;
}

test('bilhete versionado, reação e retomada mantêm a audiência privada sem duplicar intenção', async ({ browser }) => {
  test.setTimeout(240_000);
  const f = await pilotFixture(); const contexts: BrowserContext[] = [];
  try {
    const people = await Promise.all([f.createUser(), f.createUser(), f.createUser(), f.createUser()]);
    const owner = await personPage(browser, people[0]); contexts.push(owner.context);
    const ana = await personPage(browser, people[1]); contexts.push(ana.context);
    const bia = await personPage(browser, people[2]); contexts.push(bia.context);
    const admin = await personPage(browser, people[3]); contexts.push(admin.context);
    const storeId = await createStore(owner.page, f.trackStore);
    await invite(owner.page, ana.page, storeId); await invite(owner.page, bia.page, storeId);
    const membershipId = (await f.database.query('SELECT id FROM app."Membership" WHERE "storeId"=$1 AND "profileId"=$2', [storeId, people[1].id])).rows[0].id as string;
    const firstText = `Bilhete privado versão um ${randomUUID()}`;
    const secondText = `Bilhete privado versão dois ${randomUUID()}`;
    await sendNote(owner.page, storeId, membershipId, firstText, 1);
    const firstId = (await f.database.query('SELECT id FROM app."NoteVersion" WHERE "storeId"=$1 AND "participantMembershipId"=$2 AND version=1', [storeId, membershipId])).rows[0].id as string;
    const readCount = async (id: string) => (await f.database.query('SELECT count(*)::int n FROM app."NoteRead" WHERE "noteVersionId"=$1', [id])).rows[0].n as number;
    await ana.page.goto(`/lojas/${storeId}`);
    await expect(ana.page.getByText('Bilhete não lido', { exact: true })).toBeVisible();
    expect(await readCount(firstId)).toBe(0);
    await ana.page.getByRole('button', { name: '♡ Abrir bilhete', exact: true }).click();
    const noteDialog = ana.page.getByRole('dialog', { name: 'Seu bilhete', exact: true });
    await expect(noteDialog.getByText(firstText, { exact: true })).toBeVisible();
    await expect.poll(() => readCount(firstId)).toBe(1);
    await waitForDomainBudget(f.database, people[0].id);
    await sendNote(owner.page, storeId, membershipId, secondText, 2);
    const secondId = (await f.database.query('SELECT id FROM app."NoteVersion" WHERE "storeId"=$1 AND "participantMembershipId"=$2 AND version=2', [storeId, membershipId])).rows[0].id as string;
    await ana.page.bringToFront();
    await expect(noteDialog.getByRole('button', { name: 'Abrir o bilhete novo', exact: true })).toBeVisible({ timeout: 40_000 });
    await expect(noteDialog.getByText(firstText, { exact: true })).toBeVisible();
    await expect(noteDialog.getByText(secondText, { exact: true })).toHaveCount(0);
    expect(await readCount(secondId)).toBe(0);
    await noteDialog.getByRole('button', { name: 'Abrir o bilhete novo', exact: true }).click();
    await expect(noteDialog.getByText(secondText, { exact: true })).toBeVisible();
    await expect.poll(() => readCount(secondId)).toBe(1);
    await noteDialog.getByRole('button', { name: 'Fechar', exact: true }).focus();
    await ana.page.keyboard.press('Shift+Tab');
    await expect(noteDialog.getByRole('button', { name: 'Guardar esse carinho', exact: true })).toBeFocused();
    await ana.page.keyboard.press('Tab'); await expect(noteDialog.getByRole('button', { name: 'Fechar', exact: true })).toBeFocused();
    await ana.page.keyboard.press('Escape'); await expect(noteDialog).toBeHidden();
    await expect(ana.page.getByRole('button', { name: '♡ Abrir bilhete', exact: true })).toBeFocused();
    for (const width of [320, 390]) { await ana.page.setViewportSize({ width, height: 844 }); await noHorizontalOverflow(ana.page); }
    await ana.page.emulateMedia({ reducedMotion: 'reduce' });
    await ana.page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    await noHorizontalOverflow(ana.page);
    await ana.page.evaluate(() => { document.documentElement.style.fontSize = ''; });

    await waitForDomainBudget(f.database, people[0].id);
    await waitForDomainBudget(f.database, people[1].id);
    const activityId = await createActivity(owner.page, storeId);
    const recordId = await submitRecord(ana.page, storeId, activityId, true);
    const biaRecord = await submitRecord(bia.page, storeId, activityId, true);
    const conversationId = (await f.database.query('SELECT id FROM app."Conversation" WHERE "subjectType"=\'SUBMISSION\' AND "subjectId"=$1', [recordId])).rows[0].id as string;
    await waitForDomainBudget(f.database, people[1].id, { read: 70, write: 15 });
    await ana.page.goto(`/lojas/${storeId}/registros/${recordId}`);
    const privateComment = `Comentário só da relação Ana ${randomUUID()}`;
    await ana.page.getByLabel('Seu comentário', { exact: true }).fill(privateComment);
    await ana.page.getByRole('button', { name: 'Enviar comentário', exact: true }).click();
    await expect(ana.page.getByRole('list', { name: 'Comentários do item', exact: true }).getByText(privateComment, { exact: true })).toBeVisible();
    const heart = ana.page.getByRole('button', { name: 'Reagir com coração', exact: true });
    const applause = ana.page.getByRole('button', { name: 'Reagir com palmas', exact: true });
    await heart.click(); await expect(heart).toHaveAttribute('aria-pressed', 'true');
    await applause.click(); await expect(applause).toHaveAttribute('aria-pressed', 'true'); await expect(heart).toHaveAttribute('aria-pressed', 'false');
    await ana.page.getByRole('button', { name: 'Remover minha reação', exact: true }).click();
    await expect(applause).toHaveAttribute('aria-pressed', 'false');
    expect((await f.database.query('SELECT emoji,version FROM app."Reaction" WHERE "conversationId"=$1 AND "actorProfileId"=$2', [conversationId, people[1].id])).rows[0]).toEqual({ emoji: null, version: 3 });

    await waitForDomainBudget(f.database, people[1].id);
    await ana.context.setOffline(true);
    await ana.page.getByRole('button', { name: 'Reagir com fogo', exact: true }).click();
    await expect(ana.page.getByRole('button', { name: 'Consultar minha reação', exact: true })).toBeVisible();
    const pendingURL = ana.page.url(); const operationId = new URL(pendingURL).searchParams.get(`reacao-${conversationId}`);
    expect(operationId).toMatch(/^[a-f0-9-]{36}$/);
    expect((await f.database.query('SELECT id FROM app."ReactionEvent" WHERE id=$1', [operationId])).rowCount).toBe(0);
    await ana.context.setOffline(false);
    await ana.page.getByRole('button', { name: 'Consultar minha reação', exact: true }).click();
    await expect(ana.page.getByRole('button', { name: 'Reagir com fogo', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await ana.page.goto(pendingURL);
    await expect(ana.page.getByRole('button', { name: 'Reagir com fogo', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(ana.page.getByRole('status').filter({ hasText: 'Alteração confirmada.' })).toBeVisible();
    expect((await f.database.query('SELECT count(*)::int n FROM app."ReactionEvent" WHERE id=$1', [operationId])).rows[0].n).toBe(1);
    expect((await f.database.query('SELECT version FROM app."Reaction" WHERE "conversationId"=$1 AND "actorProfileId"=$2', [conversationId, people[1].id])).rows[0].version).toBe(4);

    const anaImage = await privateImageURL(ana.page);
    const ownBytes = await ana.page.request.get(anaImage, { headers: { Range: 'bytes=0-0' } });
    expect(ownBytes.status()).toBe(206); expect((await ownBytes.body()).length).toBe(1);
    await bia.page.goto(`/lojas/${storeId}/registros/${biaRecord}`);
    const biaImage = await privateImageURL(bia.page);
    expect((await bia.page.request.get(anaImage, { headers: { Range: 'bytes=0-0' } })).status()).toBe(404);
    expect((await ana.page.request.get(biaImage, { headers: { Range: 'bytes=0-0' } })).status()).toBe(404);

    for (const endpoint of [`/api/lojas/${storeId}/registros/${recordId}`, `/api/lojas/${storeId}/bilhetes/versoes/${firstId}`,
      `/api/lojas/${storeId}/conversas/${conversationId}/comentarios`]) expect((await bia.page.request.get(endpoint)).status()).toBe(404);
    expect((await ana.page.request.get(`/api/lojas/${storeId}/registros/${biaRecord}`)).status()).toBe(404);
    await bia.page.goto(`/lojas/${storeId}/registros/${recordId}`);
    await expect(bia.page.getByRole('heading', { name: 'Registro indisponível', exact: true })).toBeVisible();
    for (const marker of [firstText, secondText, privateComment]) expect(await bia.page.content()).not.toContain(marker);
    await provisionAdmin(admin.page, f.database, people[3], f.trackRateKey);
    expect((await admin.page.request.get(`/api/lojas/${storeId}/registros/${recordId}`)).status()).toBe(404);
    expect((await admin.page.request.get(`/api/lojas/${storeId}/bilhetes/versoes/${firstId}`)).status()).toBe(404);
    expect((await admin.page.request.get(anaImage, { headers: { Range: 'bytes=0-0' } })).status()).toBe(404);
    await admin.page.goto(`/lojas/${storeId}/registros/${recordId}`);
    await expect(admin.page.getByRole('heading', { name: 'Mimos indisponíveis', exact: true })).toBeVisible();
    for (const marker of [firstText, secondText, privateComment]) expect(await admin.page.content()).not.toContain(marker);
    expect((await f.database.query('SELECT "actorProfileId",text FROM app."NoteVersion" WHERE id=ANY($1::uuid[]) ORDER BY version', [[firstId, secondId]])).rows)
      .toEqual([{ actorProfileId: people[0].id, text: firstText }, { actorProfileId: people[0].id, text: secondText }]);
  } finally { await closeContexts(contexts); await f.cleanup(); }
});
