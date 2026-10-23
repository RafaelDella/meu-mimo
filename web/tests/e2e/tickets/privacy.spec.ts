import { expect } from '@playwright/test';
import type { TicketTransitionBody } from '../../../src/contracts/redemptions';
import { flushView, ids, json, store } from '../stores/helpers';
import { mockTickets, test, ticketPath, ticketView } from './helpers';

for (const source of ['events', 'lookup', 'transition'] as const) for (const status of [401, 403, 404]) {
  test(`${status} em ${source} remove ticket, rascunhos e navegação privada`, async ({ page }) => {
    let invalidateSession = () => {}; let requested = false;
    const { state, auth } = await mockTickets(page, { merchant: true, handler: async (route, url) => {
      const selected = source === 'events' ? url.pathname.endsWith('/eventos') : source === 'lookup' ? url.pathname.includes('/tickets/') && url.pathname.includes('/operacoes/') : url.pathname.endsWith('/transicoes');
      if (!selected) return false;
      requested = true; if (status === 401) invalidateSession();
      await json(route, { code: status === 401 ? 'session_invalid' : 'resource_not_found', message: 'Este conteúdo não está disponível para esta conta.' }, status); return true;
    } });
    invalidateSession = () => { auth.loggedIn = false; };
    if (source === 'events') state.history = Array.from({ length: 21 }, (_, index) => ({ ...state.history[0], id: `event-${index}`, version: index + 1 }));
    await page.goto(source === 'lookup' ? `${ticketPath}?transicao=71111111-1111-4111-8111-111111111111` : ticketPath);
    if (source === 'events') await page.getByRole('region', { name: 'Histórico deste ticket', exact: true }).getByRole('button', { name: 'Próximos', exact: true }).click();
    if (source === 'transition') { await page.getByRole('button', { name: 'Marcar realização', exact: true }).click(); await page.getByRole('button', { name: 'Confirmar realização', exact: true }).click(); }
    await expect.poll(() => requested).toBe(true);
    await expect(page.getByRole('heading', { name: status === 401 ? 'Acesse sua conta' : 'Mimos indisponíveis', exact: true })).toBeVisible();
    await expect(page.getByRole('article', { name: 'Seu vale mimo', exact: true })).toHaveCount(0); await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Combinado e realização', exact: true })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Mimos', exact: true })).toHaveCount(0);
  });
}

test('troca de conta aborta mutação e descarta rascunho sem renderizar resposta atrasada', async ({ page }) => {
  let release: (() => void) | undefined; let finished: (() => void) | undefined; let requested = false;
  const delayed = new Promise<void>(resolve => { release = resolve; }); const delivered = new Promise<void>(resolve => { finished = resolve; });
  const { state, auth } = await mockTickets(page, { merchant: true, handler: async (route, url, mock) => {
    if (!url.pathname.endsWith('/transicoes')) return false;
    requested = true; const body = route.request().postDataJSON() as TicketTransitionBody; await delayed;
    const event = { ...mock.history[0], id: body.operationId, kind: 'AGREE' as const, version: 2, text: 'Combinado secreto da conta anterior' };
    await json(route, { ticket: { ...ticketView(mock), agreementText: event.text }, event, appliedVersion: 2 }).catch(() => {}); finished!(); return true;
  } });
  await page.goto(ticketPath); await page.getByRole('button', { name: 'Registrar combinado', exact: true }).click();
  await page.getByRole('textbox', { name: 'Combinado', exact: true }).fill('Rascunho privado da conta anterior'); await page.getByRole('button', { name: 'Salvar combinado', exact: true }).click();
  await expect.poll(() => requested).toBe(true); auth.userId = ids.bia; auth.stores = [store({ role: 'MERCHANT', name: 'Loja atual da Bia' })];
  state.current.agreementText = 'Combinado da conta atual';
  await page.evaluate(() => window.dispatchEvent(new Event('meumimo:session-changed')));
  await expect(page.getByRole('heading', { name: 'Loja atual da Bia', exact: true })).toBeVisible();
  release!(); await delivered; await flushView(page);
  await expect(page.getByText('Combinado secreto da conta anterior', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'Combinado', exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))).not.toContain('Rascunho privado');
});
