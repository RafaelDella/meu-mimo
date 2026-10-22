import { expect } from '@playwright/test';
import { test, mockAlbums, openAlbum, selectReady, confirmPublish, api, json, collectionId, ids, ticketPath, asset, pixel } from './helpers';
import { flushView, store } from '../stores/helpers';

for (const source of ['album', 'collection', 'asset', 'publication', 'lookup', 'thumbnail', 'display', 'content', 'removal'] as const) {
  for (const status of [401, 403, 404]) test(`${status} em ${source} apaga ticket, álbum e rascunhos`, async ({ page }) => {
    let requested = false; let invalidate = () => {};
    const published = ['thumbnail', 'display', 'content', 'removal'].includes(source);
    const { auth } = await mockAlbums(page, { published: published ? 1 : 0,
      assets: source === 'asset' ? [asset(1, { state: 'UPLOADING', uploadedBytes: 0 })] : undefined,
      handler: async (route, url) => {
        if (source === 'lookup' && url.pathname === `${api}/publicacoes`) { await json(route, { code: 'retry', message: 'Consulte o resultado.' }, 503); return true; }
        const method = route.request().method();
        const selected = source === 'album' ? url.pathname === api :
          source === 'collection' ? url.pathname.endsWith(`/midia/${collectionId}`) :
          source === 'asset' ? /\/midia\/arquivos\/[^/]+$/.test(url.pathname) && method === 'GET' :
          source === 'publication' ? url.pathname === `${api}/publicacoes` :
          source === 'lookup' ? url.pathname.startsWith(`${api}/operacoes/`) :
          source === 'thumbnail' ? url.pathname.endsWith('/acesso') && route.request().postDataJSON().variant === 'thumbnail' :
          source === 'display' ? url.pathname.endsWith('/acesso') && route.request().postDataJSON().variant === 'display' :
          source === 'content' ? url.pathname.startsWith('/api/album-content/') && url.searchParams.get('variant') === 'display' : url.pathname.endsWith('/remover');
        if (!selected) return false;
        requested = true; if (status === 401) invalidate();
        await json(route, { code: 'resource_not_found', message: 'Este conteúdo não está disponível.' }, status); return true;
      } });
    invalidate = () => { auth.loggedIn = false; };
    if (['album', 'collection', 'thumbnail'].includes(source)) await page.goto(ticketPath);
    else {
      await openAlbum(page);
      if (source === 'asset') {
        await page.getByLabel('Arquivo original para retomar', { exact: true }).setInputFiles({ name: 'mesma-foto.png', mimeType: 'image/png', buffer: pixel });
        await page.getByRole('button', { name: 'Retomar arquivo', exact: true }).click();
      } else if (source === 'publication' || source === 'lookup') {
        await selectReady(page, 1); await page.getByLabel('Legenda do momento 1', { exact: true }).fill('Legenda privada a descartar'); await confirmPublish(page, 1);
        if (source === 'lookup') await page.getByRole('button', { name: 'Consultar resultado da publicação', exact: true }).click();
      } else if (source === 'removal') {
        await page.getByRole('button', { name: 'Remover momento 1', exact: true }).click(); await page.getByRole('button', { name: 'Confirmar remoção do momento', exact: true }).click();
      } else await page.getByRole('button', { name: 'Abrir foto 1', exact: true }).click();
    }
    await expect.poll(() => requested).toBe(true);
    await expect(page.getByRole('heading', { name: status === 401 ? 'Acesse sua conta' : 'Mimos indisponíveis', exact: true })).toBeVisible();
    await expect(page.getByRole('article', { name: 'Seu vale mimo', exact: true })).toHaveCount(0);
    await expect(page.getByRole('dialog')).toHaveCount(0); await expect(page.getByRole('link', { name: 'Mimos', exact: true })).toHaveCount(0);
    expect(await page.locator('body').innerText()).not.toContain('Legenda privada');
  });
}

test('troca de conta aborta publicação e ignora resposta antiga sem persistir legenda', async ({ page }) => {
  let release: (() => void) | undefined; let finished: (() => void) | undefined; let requested = false;
  const delayed = new Promise<void>(resolve => { release = resolve; }); const delivered = new Promise<void>(resolve => { finished = resolve; });
  const { auth, state } = await mockAlbums(page, { handler: async (route, url) => {
    if (url.pathname !== `${api}/publicacoes`) return false;
    requested = true; await delayed;
    await json(route, { album: { id: null, items: [{ caption: 'Legenda da resposta antiga' }] } }).catch(() => {}); finished!(); return true;
  } });
  await openAlbum(page); await selectReady(page, 1); await page.getByLabel('Legenda do momento 1', { exact: true }).fill('Legenda secreta da conta antiga'); await confirmPublish(page, 1);
  await expect.poll(() => requested).toBe(true);
  auth.userId = ids.bia; auth.stores = [store({ role: 'MERCHANT', name: 'Loja atual da Bia' })];
  state.album.collectionId = null; state.album.permissions = { canStart: false, canUpload: false, canPublish: false };
  await page.evaluate(() => window.dispatchEvent(new Event('meumimo:session-changed')));
  await expect(page.getByRole('heading', { name: 'Loja atual da Bia', exact: true })).toBeVisible();
  release!(); await delivered; await flushView(page);
  expect(await page.locator('body').innerText()).not.toContain('Legenda secreta'); expect(await page.locator('body').innerText()).not.toContain('Legenda da resposta antiga');
  expect(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))).not.toContain('Legenda secreta');
});

test('troca de ticket descarta revisão e ignora publicação anterior atrasada', async ({ page }) => {
  let release: (() => void) | undefined; let finished: (() => void) | undefined; let requested = false;
  const delayed = new Promise<void>(resolve => { release = resolve; }); const delivered = new Promise<void>(resolve => { finished = resolve; });
  const { ticketState } = await mockAlbums(page, { handler: async (route, url) => {
    if (url.pathname !== `${api}/publicacoes`) return false;
    requested = true; await delayed; await json(route, { album: { items: [{ caption: 'Resposta do ticket anterior' }] } }).catch(() => {}); finished!(); return true;
  } });
  const nextId = 'e2222222-2222-4222-8222-222222222222';
  ticketState.reward!.tickets.push({ ...ticketState.current, id: nextId, code: 'MIMO-OUTRO',
    snapshot: { ...ticketState.current.snapshot, name: 'Segundo mimo privado' }, conversation: { ...ticketState.current.conversation, subjectId: nextId } });
  await openAlbum(page); await selectReady(page, 1); await page.getByLabel('Legenda do momento 1', { exact: true }).fill('Texto do ticket anterior'); await confirmPublish(page, 1);
  await expect.poll(() => requested).toBe(true); await page.goto(ticketPath.replace(/[^/]+$/, nextId));
  await expect(page.getByRole('heading', { name: 'Segundo mimo privado', exact: true })).toBeVisible();
  release!(); await delivered; await flushView(page);
  expect(await page.locator('body').innerText()).not.toContain('Texto do ticket anterior'); expect(await page.locator('body').innerText()).not.toContain('Resposta do ticket anterior');
});
