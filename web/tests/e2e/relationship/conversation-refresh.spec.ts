import { expect } from '@playwright/test';
import { test, json } from '../stores/helpers';
import { mockRewards, ticket, ticketId, ticketsPath, now } from '../redemptions/helpers';
import { mockRelationship, home, refresh } from './helpers';

test('comentários recuperam retorno à aba e polling sem perder rascunho ou foco', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-22T12:00:00Z') });
  const items: { id: string; text: string; createdAt: string; author: { id: string; displayName: string } }[] = [];
  let reads = 0;
  const { state } = await mockRewards(page, { handler: async (route, url) => {
    if (!url.pathname.endsWith('/comentarios') || route.request().method() !== 'GET') return false;
    reads++;
    await json(route, { conversation: ticket().conversation, items: [...items], page: 1, pageSize: 20, total: items.length });
    return true;
  } });
  state.tickets = [ticket()]; await page.goto(`${ticketsPath}/${ticketId}`);
  const draft = page.getByLabel('Seu comentário', { exact: true });
  await draft.fill('Meu rascunho continua aqui.');
  await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now() + 1000)));
  items.push({ id: 'comment-one', text: 'Comentário recebido em outra aba', createdAt: now, author: { id: 'merchant', displayName: 'Rafa' } });
  const before = reads;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByText('Comentário recebido em outra aba', { exact: true })).toBeVisible();
  expect(reads).toBeGreaterThan(before);
  await expect(draft).toHaveValue('Meu rascunho continua aqui.'); await expect(draft).toBeFocused();
  items.push({ id: 'comment-two', text: 'Comentário recuperado pelo relógio', createdAt: now, author: { id: 'merchant', displayName: 'Rafa' } });
  await page.clock.runFor(30_000);
  await expect(page.getByText('Comentário recuperado pelo relógio', { exact: true })).toBeVisible();
  await expect(draft).toHaveValue('Meu rascunho continua aqui.'); await expect(draft).toBeFocused();
});

test('503 no polling conserva comentário em edição e foco até a recuperação', async ({ page }) => {
  let failed = false;
  await mockRelationship(page, { handler: async (route, url) => {
    if (!url.pathname.endsWith('/comentarios') || !failed) return false;
    await json(route, { code: 'temporarily_unavailable', message: 'Conversa temporariamente indisponível.' }, 503); return true;
  } });
  await page.goto(`${home}/mural`);
  await page.getByRole('button', { name: 'Abrir conversa deste item', exact: true }).click();
  const draft = page.getByLabel('Seu comentário', { exact: true });
  await draft.fill('Rascunho preservado durante a falha.'); failed = true;
  await refresh(page);
  await expect(page.getByText('Conversa temporariamente indisponível.', { exact: true })).toBeVisible();
  await expect(draft).toHaveValue('Rascunho preservado durante a falha.'); await expect(draft).toBeFocused();
  failed = false; await refresh(page);
  await expect(page.getByText('Conversa temporariamente indisponível.', { exact: true })).toHaveCount(0);
  await expect(draft).toHaveValue('Rascunho preservado durante a falha.'); await expect(draft).toBeFocused();
});

for (const status of [401, 403, 404]) test(`consulta ${status} após comentário confirmado retira o conteúdo privado do mural`, async ({ page }) => {
  let sent = false;
  await mockRelationship(page, { handler: async (route, url) => {
    if (!url.pathname.endsWith('/comentarios')) return false;
    if (route.request().method() === 'POST') {
      sent = true; await json(route, { id: 'confirmed-comment' }); return true;
    }
    if (!sent) return false;
    await json(route, { code: 'resource_not_found', message: 'Conversa indisponível.' }, status); return true;
  } });
  // Isola a consulta direta pós-envio: outra invalidação não pode mascarar
  // a falta de propagação da perda de acesso nesse caminho específico.
  await page.addInitScript(() => window.addEventListener('meumimo:relationship-changed', event => event.stopImmediatePropagation()));
  await page.goto(`${home}/mural`);
  await page.getByRole('button', { name: 'Abrir conversa deste item', exact: true }).click();
  await page.getByLabel('Seu comentário', { exact: true }).fill('Envio confirmado antes da perda de acesso.');
  await page.getByRole('button', { name: 'Enviar comentário', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Mimos indisponíveis', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Conquista privada 1', exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Seu comentário', { exact: true })).toHaveCount(0);
});
