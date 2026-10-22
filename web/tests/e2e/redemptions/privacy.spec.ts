import { expect } from '@playwright/test';
import { catalogPath, detailPath, mockRewards, reward, test, ticket, ticketId, ticketsPath } from './helpers';
import { flushView, ids, json, store } from '../stores/helpers';

for (const source of ['balance', 'summary', 'catalog', 'reward', 'people', 'ticket', 'lookup', 'conversation'] as const) {
  for (const status of [401, 403, 404]) test(`${status} em ${source} descarta toda a área privada de mimos`, async ({ page }) => {
    let requested = false;
    let invalidateSession = () => {};
    const { state, auth } = await mockRewards(page, { merchant: source === 'people', handler: async (route, url) => {
      const selected = source === 'balance' ? url.pathname.endsWith('/pontos') : source === 'summary' ? url.pathname.endsWith('/tickets/resumo') :
        source === 'catalog' ? url.pathname.endsWith('/mimos') : source === 'reward' ? /\/mimos\/[^/]+$/.test(url.pathname) : source === 'people' ? url.pathname.endsWith('/participacoes') :
          source === 'ticket' ? url.pathname.endsWith(`/tickets/${ticketId}`) : source === 'lookup' ? url.pathname.includes('/operacoes/') : url.pathname.endsWith('/comentarios');
      if (!selected) return false;
      requested = true;
      if (status === 401) invalidateSession();
      await json(route, { code: status === 401 ? 'session_invalid' : 'resource_not_found', message: 'Conteúdo indisponível para esta conta.' }, status); return true;
    } }); state.tickets = [ticket()]; invalidateSession = () => { auth.loggedIn = false; };
    const path = source === 'reward' ? detailPath : source === 'people' ? ticketsPath : source === 'ticket' || source === 'conversation' ? `${ticketsPath}/${ticketId}` :
      source === 'lookup' ? `${detailPath}?operacao=${ticketId}` : catalogPath;
    await page.goto(path); await expect.poll(() => requested).toBe(true);
    await expect(page.getByRole('heading', { name: status === 401 ? 'Acesse sua conta' : 'Mimos indisponíveis', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Café da ocasião', exact: true })).toHaveCount(0);
    await expect(page.locator('.ui-points')).toHaveCount(0); await expect(page.getByRole('article', { name: 'Seu vale mimo', exact: true })).toHaveCount(0);
    await expect(page.getByRole('combobox', { name: 'Pessoa dos resgates', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Resgatar mimo', exact: true })).toHaveCount(0);
  });
}

test('troca de conta aborta resposta de mimo anterior e descarta rascunho', async ({ page }) => {
  let release: (() => void) | undefined; let delivered: (() => void) | undefined; let requested = false;
  const delayed = new Promise<void>(resolve => { release = resolve; }); const finished = new Promise<void>(resolve => { delivered = resolve; });
  const { auth } = await mockRewards(page, { merchant: true, handler: async (route, url) => {
    if (requested || !/\/mimos\/[^/]+$/.test(url.pathname)) return false;
    requested = true; await delayed;
    await json(route, reward({ name: 'Resposta privada atrasada da Ana' })).catch(() => {}); delivered!(); return true;
  } });
  await page.goto(`${detailPath}/editar`); await expect.poll(() => requested).toBe(true);
  auth.userId = ids.bia; auth.stores = [store({ role: 'MERCHANT', name: 'Loja da Bia' })];
  await page.evaluate(() => window.dispatchEvent(new Event('meumimo:session-changed')));
  await expect(page.getByRole('heading', { name: 'Loja da Bia', exact: true })).toBeVisible();
  await expect(page.getByLabel('Nome do mimo', { exact: true })).toHaveValue('Café da ocasião');
  release!(); await finished; await flushView(page);
  await expect(page.getByText('Resposta privada atrasada da Ana', { exact: true })).toHaveCount(0);
  const storage = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } })); expect(storage).not.toContain('Café da ocasião');
});

test('troca de loja descarta saldo e catálogo de resposta atrasada', async ({ page }) => {
  let release: (() => void) | undefined; let delivered: (() => void) | undefined; let requested = false;
  const delayed = new Promise<void>(resolve => { release = resolve; }); const finished = new Promise<void>(resolve => { delivered = resolve; });
  const { auth } = await mockRewards(page, { handler: async (route, url) => {
    if (url.pathname.includes(ids.second) && /\/mimos\/[^/]+$/.test(url.pathname)) { await json(route, reward({ storeId: ids.second, name: 'Mimo da outra loja' })); return true; }
    if (requested || !url.pathname.includes(ids.first) || !/\/mimos\/[^/]+$/.test(url.pathname)) return false;
    requested = true; await delayed; await json(route, reward({ name: 'Mimo privado da primeira loja' })).catch(() => {}); delivered!(); return true;
  } }); auth.stores.push(store({ id: ids.second, name: 'Outra loja' }));
  await page.goto(detailPath); await expect.poll(() => requested).toBe(true);
  await page.goto(`/lojas/${ids.second}/mimos/${reward().id}`); await expect(page.getByRole('heading', { name: 'Mimo da outra loja', exact: true })).toBeVisible();
  release!(); await finished; await flushView(page); await expect(page.getByText('Mimo privado da primeira loja', { exact: true })).toHaveCount(0);
});
