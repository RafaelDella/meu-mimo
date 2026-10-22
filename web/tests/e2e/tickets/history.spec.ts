import { expect } from '@playwright/test';
import { ids, json, store } from '../stores/helpers';
import { mockTickets, now, test, ticketId, ticketPath } from './helpers';

test('histórico crescente mantém primeira página e consulta demais sem roubar foco', async ({ page }) => {
  const { state } = await mockTickets(page, { merchant: true });
  state.history = Array.from({ length: 21 }, (_, index) => ({ ...state.history[0], id: `event-${index}`, version: index + 1,
    kind: index === 0 ? 'ISSUED' as const : 'AGREE' as const, text: index ? `Revisão privada ${index}` : '' }));
  state.current.version = 21;
  await page.goto(ticketPath); const history = page.getByRole('region', { name: 'Histórico deste ticket', exact: true });
  await expect(history.getByText('Revisão privada 19', { exact: true })).toBeVisible(); await expect(history.getByText('Revisão privada 20', { exact: true })).toHaveCount(0);
  await history.getByRole('button', { name: 'Próximos', exact: true }).click(); await expect(history.getByText('Revisão privada 20', { exact: true })).toBeVisible();
  await expect(history.getByText('Página 2 de 2', { exact: true })).toBeVisible();
  expect(state.reward!.calls.some(call => call.includes('/eventos?page=2&pageSize=20'))).toBe(true);
  await history.getByRole('button', { name: 'Anteriores', exact: true }).click(); await expect(history.getByText('Revisão privada 1', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Café da ocasião', exact: true })).not.toBeFocused();
});

for (const [from, to] of [[1, 2], [2, 3], [2, 1]] as const) test(`paginação pelo teclado conduz foco ao histórico em ${from}→${to}`, async ({ page }) => {
  const { state } = await mockTickets(page, { merchant: true });
  state.history = Array.from({ length: 41 }, (_, index) => ({ ...state.history[0], id: `event-${index}`, version: index + 1,
    kind: index === 0 ? 'ISSUED' as const : 'AGREE' as const, text: index ? `Revisão privada ${index}` : '' }));
  state.current.version = 41;
  await page.goto(ticketPath);
  const history = page.getByRole('region', { name: 'Histórico deste ticket', exact: true });
  if (from === 2) {
    await history.getByRole('button', { name: 'Próximos', exact: true }).click();
    await expect(history.getByText('Página 2 de 3', { exact: true })).toBeVisible();
  }
  const direction = to > from ? 'Próximos' : 'Anteriores';
  await history.getByRole('button', { name: direction, exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(history.getByText(`Página ${to} de 3`, { exact: true })).toBeVisible();
  await expect(history.getByRole('heading', { name: 'Histórico deste ticket', exact: true })).toBeFocused();
});

test('devolução tem filtro próprio e abre ticket preservando filtros do extrato', async ({ page }) => {
  await mockTickets(page, { handler: async (route, url) => {
    if (!url.pathname.endsWith('/pontos/movimentos')) return false;
    await json(route, { items: [{ id: 'refund-id', storeId: ids.first, participantMembershipId: store().membershipId, submissionId: null,
      redemptionId: ticketId, redemptionEventId: 'cancel-event-id', activityName: null, rewardName: 'Café da ocasião', origin: { type: 'REDEMPTION', id: ticketId, name: 'Café da ocasião' },
      amount: '10', kind: 'REDEMPTION_REFUND', createdAt: now, participant: { displayName: 'Ana participante' }, actor: { displayName: 'Rafa lojista' },
      path: ticketPath, reviewEventId: null, compensatesEntryId: 'original-debit' }], page: 1, pageSize: 20, total: 1 }); return true;
  } });
  const path = `/lojas/${ids.first}/extrato?kind=REDEMPTION_REFUND&from=2026-10-01&page=1`;
  await page.goto(path); await expect(page.getByRole('combobox', { name: 'Tipo de movimento', exact: true })).toHaveValue('REDEMPTION_REFUND');
  await expect(page.getByText('Esta devolução compensa o débito original deste resgate.', { exact: true })).toBeVisible();
  await expect(page.getByText('Este ajuste compensa um movimento anterior da mesma conquista.', { exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: /Abrir origem do movimento/ }).click(); await page.getByRole('link', { name: 'Voltar ao extrato com os filtros', exact: true }).click();
  await expect(page).toHaveURL(path);
});
