import { expect } from '@playwright/test';
import { test, mockAdmin, accountPath, storePath, json } from './helpers';

test('admin usa só sessão e endpoints administrativos, sem consulta de relações privadas', async ({ page }) => {
  const { state } = await mockAdmin(page); await page.goto(accountPath); await expect(page.getByRole('heading', { name: 'Vínculos administrativos', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Lojas', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Lojas', exact: true })).toBeVisible();
  expect(state.calls.filter(call => !call.includes('/api/admin/') && !call.includes('/api/auth/session'))).toEqual([]);
});
test('motivo não entra em URL ou armazenamento do navegador', async ({ page }) => {
  await mockAdmin(page); await page.goto(accountPath); await page.getByRole('button', { name: 'Bloquear acesso por segurança', exact: true }).click();
  const reason = 'Marcador de motivo só em memória'; await page.getByLabel('Motivo administrativo', { exact: true }).fill(reason);
  expect(page.url()).not.toContain('Marcador'); expect(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))).not.toContain(reason);
  await page.keyboard.press('Escape'); await expect(page.getByLabel('Motivo administrativo', { exact: true })).not.toBeVisible();
  await page.getByRole('button', { name: 'Bloquear acesso por segurança', exact: true }).click(); await expect(page.getByLabel('Motivo administrativo', { exact: true })).toHaveValue('');
});
test('resposta tardia do alvo anterior não aparece depois de navegar', async ({ page }) => {
  let release: (() => void) | undefined;
  await mockAdmin(page, { handler: async (route, url) => {
    if (url.pathname !== '/api/admin/contas/22222222-2222-4222-8222-222222222222') return false;
    await new Promise<void>(resolve => { release = resolve; });
    await json(route, { id: 'old', displayName: 'Marcador do alvo anterior', createdAt: '2026-10-23T12:00:00Z', suspendedAt: null, version: 0, createdStores: 0, participations: { open: 0, closed: 0, revoked: 0 }, canBlock: true }); return true;
  } });
  await page.goto(accountPath); await expect.poll(() => !!release).toBe(true); await page.getByRole('link', { name: 'Lojas', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Lojas', exact: true })).toBeVisible(); release!(); await expect(page.getByText('Marcador do alvo anterior', { exact: true })).toHaveCount(0);
});
for (const status of [401, 403]) test(`perda de acesso${status} em consulta limpa a administração`, async ({ page }) => {
  let denied = false; await mockAdmin(page, { handler: async (route, url) => {
    if (url.pathname !== '/api/admin/lojas/33333333-3333-4333-8333-333333333333' || !denied) return false;
    await json(route, { code: status === 401 ? 'identity_missing' : 'admin_forbidden', message: 'Acesso administrativo não permitido.' }, status); return true;
  } });
  await page.goto(storePath); await expect(page.getByText('Loja de metadados', { exact: true }).first()).toBeVisible(); denied = true;
  await page.getByRole('button', { name: 'Atualizar metadados do alvo', exact: true }).click(); await expect(page.getByText('Loja de metadados', { exact: true }).first()).not.toBeVisible();
});
