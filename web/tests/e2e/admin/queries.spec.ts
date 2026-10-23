import { expect } from '@playwright/test';
import { test, mockAdmin, account, adminStore, accountId, storeId } from './helpers';

test('busca de contas usa POST e não coloca nome na URL', async ({ page }) => {
  const { state } = await mockAdmin(page); await page.goto('/admin/contas'); const query = 'Pessoa de metadados';
  await page.getByLabel('Buscar conta por nome ou UUID', { exact: true }).fill(query); await page.getByRole('button', { name: 'Buscar contas', exact: true }).click();
  await expect.poll(() => state.queries.some(item => item.path === '/api/admin/contas/consulta' && item.body.q === query)).toBe(true);
  expect(page.url()).not.toContain('Pessoa'); expect(state.calls.some(item => item.includes('q=') || item.includes('Pessoa'))).toBe(false);
  await page.getByRole('combobox', { name: 'Estado de segurança', exact: true }).selectOption('BLOCKED'); await page.getByRole('button', { name: 'Buscar contas', exact: true }).click();
  await expect(page.getByText('Nenhuma conta encontrada com estes filtros.', { exact: true })).toBeVisible();
});
test('contas e lojas mantêm paginação além de50 sem carregar tudo', async ({ page }) => {
  const { state } = await mockAdmin(page); state.accounts = Array.from({ length: 51 }, (_, index) => account({ id: `b1111111-1111-4111-8111-${String(index + 1).padStart(12, '0')}`, displayName: `Pessoa ${index + 1}` }));
  await page.goto('/admin/contas'); await expect(page.getByText('Página 1 de 3', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Próxima', exact: true }).click(); await expect(page.getByText('Página 2 de 3', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Contas', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Próxima', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Pessoa 51', exact: true })).toBeVisible();
  expect(state.queries.filter(item => item.path === '/api/admin/contas/consulta').every(item => item.body.pageSize === 20)).toBe(true);
});
test('lojas distinguem pausa do lojista e pausa da plataforma nos filtros', async ({ page }) => {
  const { state } = await mockAdmin(page); state.stores = [adminStore({ state: 'PAUSED', platformPausedAt: '2026-10-23T12:00:00Z' })]; await page.goto('/admin/lojas');
  await page.getByRole('combobox', { name: 'Estado do lojista', exact: true }).selectOption('PAUSED'); await page.getByRole('combobox', { name: 'Pausa da plataforma', exact: true }).selectOption('YES');
  await page.getByRole('button', { name: 'Buscar lojas', exact: true }).click();
  await expect.poll(() => state.queries.some(item => item.body.state === 'PAUSED' && item.body.platformPaused === true)).toBe(true);
  await expect(page.getByRole('link', { name: 'Abrir metadados da loja', exact: true })).toHaveAttribute('href', `/admin/lojas/${storeId}`);
});
test('busca de80emojis é íntegra e81 impede consulta e foca campo', async ({ page }) => {
  const { state } = await mockAdmin(page); await page.goto('/admin/contas'); const field = page.getByLabel('Buscar conta por nome ou UUID', { exact: true }); const name = '🌷'.repeat(80);
  await field.fill(name); await page.getByRole('button', { name: 'Buscar contas', exact: true }).click();
  await expect.poll(() => state.queries.some(item => item.body.q === name)).toBe(true); const count = state.queries.length;
  await field.fill(`${name}🌷`); await page.getByRole('button', { name: 'Buscar contas', exact: true }).click(); await expect(field).toBeFocused();
  await expect(page.getByRole('alert').filter({ hasText: 'Use até 80 caracteres Unicode na busca.' })).toBeVisible(); expect(state.queries).toHaveLength(count);
});
test('detalhe administrativo não abre conteúdo da relação', async ({ page }) => {
  await mockAdmin(page); await page.goto(`/admin/contas/${accountId}`);
  await expect(page.getByRole('heading', { name: 'Vínculos administrativos', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: /extrato|álbum|conquista|ticket|bilhete/i })).toHaveCount(0);
  await expect(page.locator('main')).not.toContainText('Saldo disponível');
});
