import { expect } from '@playwright/test';
import { catalogPath, detailPath, mockRewards, test, ticket, ticketsPath } from './helpers';
import { ids, json } from '../stores/helpers';

test('participante tem três abas principais, participação auxiliar e contador independente do filtro', async ({ page }) => {
  const { state } = await mockRewards(page); state.tickets = [ticket(), ticket({ id: 'second-ticket', code: 'MIMO-SECOND' })];
  await page.goto(`/lojas/${ids.first}`);
  const nav = page.getByRole('navigation', { name: 'Sua participação', exact: true });
  await expect(nav.getByRole('link')).toHaveCount(3);
  await expect(nav.getByRole('link', { name: 'Lojinha', exact: true })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Atividades', exact: true })).toBeVisible();
  const mine = nav.getByRole('link', { name: 'Meus mimos', exact: true });
  await expect(mine).toContainText('2'); await expect(mine).toHaveAccessibleDescription('2 mimos ainda a realizar.');
  await expect(page.getByRole('link', { name: 'Minha participação', exact: true })).toHaveAttribute('href', `/lojas/${ids.first}/pessoas`);
  await expect(nav.getByRole('link', { name: 'Minha participação', exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: 'Ver todos os mimos', exact: true }).click(); await expect(page).toHaveURL(catalogPath);
  await expect(page.getByRole('navigation', { name: 'Sua participação', exact: true }).getByRole('link')).toHaveCount(3);
  await page.goto(`${ticketsPath}?status=FULFILLED&page=1`);
  await expect(page.getByText('Nenhum ticket encontrado com estes filtros.', { exact: true })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Sua participação', exact: true }).getByRole('link', { name: 'Meus mimos', exact: true })).toHaveAccessibleDescription('2 mimos ainda a realizar.');
  expect(state.calls.filter(call => call.includes('/tickets/resumo')).every(call => !call.includes('status='))).toBe(true);
  await page.goto(detailPath); await expect(page.getByRole('navigation', { name: 'Sua participação', exact: true }).getByRole('link', { name: 'Meus mimos', exact: true })).toHaveAccessibleDescription('2 mimos ainda a realizar.');
});

test('navegação e contador da página compartilham uma consulta de resumo', async ({ page }) => {
  const { state } = await mockRewards(page); await page.goto(ticketsPath);
  await expect(page.getByRole('heading', { name: 'Meus tickets', exact: true })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Sua participação', exact: true }).getByRole('link', { name: 'Meus mimos', exact: true })).toHaveAccessibleDescription('0 mimos ainda a realizar.');
  expect(state.calls.filter(call => call.endsWith('/tickets/resumo'))).toHaveLength(1);
});

for (const source of ['lojinha', 'summary'] as const) test(`403 ao reler ${source} elimina apresentação privada e navegação da Lojinha`, async ({ page }) => {
  let status = 200;
  const { auth } = await mockRewards(page, { handler: async (route, url) => {
    const selected = url.pathname.endsWith(source === 'lojinha' ? '/lojinha' : '/tickets/resumo');
    if (!selected || status === 200) return false;
    await json(route, { code: status === 403 ? 'resource_not_found' : 'temporarily_unavailable', message: status === 403 ? 'Conteúdo indisponível.' : 'Consulte novamente em instantes.' }, status); return true;
  } }); auth.stores[0].presentation = 'Apresentação secreta somente desta loja';
  await page.goto(`/lojas/${ids.first}`); await expect(page.getByText('Apresentação secreta somente desta loja', { exact: true })).toBeVisible();
  status = 503; await page.evaluate(() => window.dispatchEvent(new Event('meumimo:relationship-changed')));
  const retry = page.getByRole('button', { name: source === 'lojinha' ? 'Consultar lojinha novamente' : 'Atualizar contador da navegação', exact: true });
  await expect(retry).toBeVisible();
  await expect(page.getByText('Apresentação secreta somente desta loja', { exact: true })).toBeVisible();
  status = 403; await retry.click();
  await expect(page.getByRole('heading', { name: 'Mimos indisponíveis', exact: true })).toBeVisible();
  await expect(page.getByText('Apresentação secreta somente desta loja', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Loja da Ana', exact: true })).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: 'Sua participação', exact: true })).toHaveCount(0);
});
