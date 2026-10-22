import { expect } from '@playwright/test';
import { mockRewards, test, ticket, ticketId, ticketsPath } from './helpers';
import { store } from '../stores/helpers';

test('histórico filtra estado e período inclusivo e contador ignora filtros', async ({ page }) => {
  const { state } = await mockRewards(page); state.tickets = [ticket(), ticket({ id: 'other-ticket', code: 'MIMO-5678' })];
  await page.goto(ticketsPath); await page.getByLabel('Tickets desde a data', { exact: true }).fill('2026-10-01');
  await page.getByLabel('Tickets até a data', { exact: true }).fill('2026-10-22'); await page.getByRole('combobox', { name: 'Estado do ticket', exact: true }).selectOption('FULFILLED');
  await page.getByRole('button', { name: 'Filtrar tickets', exact: true }).click();
  await expect(page).toHaveURL(/from=2026-10-01.*to=2026-10-22.*status=FULFILLED.*page=1/);
  await expect(page.getByText('Nenhum ticket encontrado com estes filtros.', { exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Mimos ainda a realizar', exact: true })).toContainText('2 mimos ainda a realizar');
  await expect(page.getByText('Total histórico: 2 tickets emitidos.', { exact: true })).toBeVisible();
  await expect.poll(() => state.queries[state.queries.length - 1]?.get('to')).toBe('2026-10-22');
});

test('lojista filtra pessoa sem oferecer resgate próprio', async ({ page }) => {
  const { state } = await mockRewards(page, { merchant: true }); state.tickets = [ticket()]; await page.goto(ticketsPath);
  await page.getByRole('combobox', { name: 'Pessoa dos resgates', exact: true }).selectOption(store().membershipId);
  await page.getByRole('button', { name: 'Filtrar tickets', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`membershipId=${store().membershipId}`));
  await expect(page.getByText('Participante: Ana participante', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Resgatar mimo', exact: true })).toHaveCount(0);
});

test('paginação e retorno de ticket preservam filtros do histórico', async ({ page }) => {
  const { state } = await mockRewards(page); state.tickets = Array.from({ length: 21 }, (_, index) => ticket({ id: index === 20 ? ticketId : `ticket-${index}`, code: `MIMO-${index}` }));
  await page.goto(`${ticketsPath}?status=WAITING_AGREEMENT&page=1`); await page.getByRole('button', { name: 'Próximos', exact: true }).click();
  await expect(page.getByText('Página 2 de 2', { exact: true })).toBeVisible(); await page.getByRole('link', { name: /Abrir ticket/ }).click();
  await page.getByRole('link', { name: 'Voltar aos tickets com os filtros', exact: true }).click();
  await expect(page).toHaveURL(`${ticketsPath}?status=WAITING_AGREEMENT&page=2`); await expect(page.getByText('Página 2 de 2', { exact: true })).toBeVisible();
});

test('histórico preserva página de 50 itens ao filtrar e abre o ticket51', async ({ page }) => {
  const { state } = await mockRewards(page);
  state.tickets = Array.from({ length: 51 }, (_, index) => ticket({ id: index === 50 ? ticketId : `ticket-${index}`, code: `MIMO-${index + 1}` }));
  await page.goto(`${ticketsPath}?pageSize=50&page=1`);
  await page.getByRole('combobox', { name: 'Estado do ticket', exact: true }).selectOption('WAITING_AGREEMENT');
  await page.getByRole('button', { name: 'Filtrar tickets', exact: true }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get('pageSize')).toBe('50');
  await page.getByRole('button', { name: 'Próximos', exact: true }).click();
  await expect(page.getByText('Página 2 de 2', { exact: true })).toBeVisible();
  await expect(page.getByText('Vale mimo · MIMO-51', { exact: true })).toBeVisible();
  await expect(page.getByText('Vale mimo · MIMO-21', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /Abrir ticket/ })).toHaveCount(1);
  await page.getByRole('link', { name: /Abrir ticket/ }).click(); await page.getByRole('link', { name: 'Voltar aos tickets com os filtros', exact: true }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get('pageSize')).toBe('50'); await expect(page.getByText('Página 2 de 2', { exact: true })).toBeVisible();
});

test('período invertido mantém filtros atuais', async ({ page }) => {
  await mockRewards(page); await page.goto(ticketsPath); await page.getByLabel('Tickets desde a data', { exact: true }).fill('2026-10-22');
  await page.getByLabel('Tickets até a data', { exact: true }).fill('2026-10-01'); await page.getByRole('button', { name: 'Filtrar tickets', exact: true }).click();
  await expect(page.getByText('A data final precisa ser igual ou posterior à inicial.', { exact: true })).toBeVisible(); await expect(page).toHaveURL(ticketsPath);
});
