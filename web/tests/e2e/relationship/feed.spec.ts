import { expect } from '@playwright/test';
import { test, mockRelationship, home, membershipId, json, noOverflow, actionsFit } from './helpers';

test('mural usa origem única e compartilha a conversa e reações', async ({ page }) => {
  const { state } = await mockRelationship(page); await page.goto(`${home}/mural`);
  await expect(page.getByRole('heading', { name: 'Conquista privada 1', exact: true })).toHaveCount(1);
  await expect(page.getByText('Só você e quem cuida desta lojinha veem este mural.', { exact: true })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Pessoa', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Abrir conversa deste item', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Conversa deste item', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Reações deste item', exact: true })).toHaveCount(1);
  expect(state.calls.some(call => call.includes('/comentarios'))).toBe(true);
});

test('filtros de tipo estado pessoa e período são consultados no servidor', async ({ page }) => {
  const { state } = await mockRelationship(page, { merchant: true }); await page.goto(`${home}/mural?participantMembershipId=${membershipId}`);
  await page.getByRole('combobox', { name: 'Tipo', exact: true }).selectOption('TICKET'); await page.getByRole('combobox', { name: 'Estado', exact: true }).selectOption('CANCELLED');
  await page.getByLabel('De', { exact: true }).fill('2026-10-01'); await page.getByLabel('Até', { exact: true }).fill('2026-10-22');
  await page.getByRole('button', { name: 'Aplicar período', exact: true }).click();
  await expect.poll(() => state.calls.some(call => call.includes('/mural?') && call.includes('type=TICKET') && call.includes('status=CANCELLED') && call.includes(`participantMembershipId=${membershipId}`) && call.includes('from=2026-10-01') && call.includes('to=2026-10-22'))).toBe(true);
});

test('mural vazio e 503 são distintos com recuperação explícita', async ({ page }) => {
  let failed = true; await mockRelationship(page, { empty: true, handler: async (route, url) => {
    if (!url.pathname.endsWith('/mural') || !failed) return false;
    await json(route, { code: 'temporarily_unavailable', message: 'Mural temporariamente indisponível.' }, 503); return true;
  } });
  await page.goto(`${home}/mural`); await expect(page.getByRole('alert').filter({ hasText: 'Mural temporariamente indisponível.' })).toBeVisible();
  await expect(page.getByText(/Ainda não há momentos neste filtro/)).not.toBeVisible(); failed = false;
  await page.getByRole('button', { name: 'Consultar mural novamente', exact: true }).click(); await expect(page.getByText(/Ainda não há momentos neste filtro/)).toBeVisible();
});

test('mural e seis controles de reação cabem em 200% com movimento reduzido', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); await mockRelationship(page); await page.goto(`${home}/mural`);
  await expect(page.getByRole('button', { name: 'Reagir com coração', exact: true })).toBeVisible(); await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  await noOverflow(page); await actionsFit(page); await page.screenshot({ path: `.artifacts/t12-mural-${testInfo.project.name}.png`, fullPage: true });
});
