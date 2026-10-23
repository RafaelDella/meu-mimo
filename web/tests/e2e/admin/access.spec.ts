import { expect } from '@playwright/test';
import { test, mockAdmin, accountPath, json, ids } from './helpers';

test('admin autorizado abre visão geral de metadados com janela UTC', async ({ page }) => {
  await mockAdmin(page); await page.goto('/admin'); await expect(page.getByRole('heading', { name: 'Administração', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Visão geral', exact: true })).toBeVisible(); await expect(page.getByText(/perfis da aplicação/i)).toBeVisible(); await expect(page.getByText(/UTC/).first()).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Administração', exact: true }).getByRole('link')).toHaveCount(3);
});
test('grant sem AAL2 orienta confirmar TOTP sem mostrar metadados', async ({ page }) => {
  await mockAdmin(page, { aal: 'aal1' }); await page.goto('/admin');
  await expect(page.getByRole('link', { name: 'Confirmar segundo fator', exact: true })).toHaveAttribute('href', /\/conta\?returnTo=%2Fadmin/);
  await expect(page.getByRole('heading', { name: 'Visão geral', exact: true })).toHaveCount(0);
});
test('AAL2 sem grant não entra nem renderiza detalhes', async ({ page }) => {
  await mockAdmin(page, { grant: false }); await page.goto(accountPath);
  await expect(page.getByRole('heading', { name: 'Acesso administrativo indisponível', exact: true })).toBeVisible();
  await expect(page.getByText('Pessoa de metadados', { exact: true })).toHaveCount(0);
});
test('revalidação de grant oculta e depois descarta árvore anterior', async ({ page }) => {
  let release: (() => void) | undefined; let hold = false;
  const { state } = await mockAdmin(page, { handler: async (route, url) => {
    if (url.pathname !== '/api/admin/session' || !hold) return false;
    await new Promise<void>(resolve => { release = resolve; }); await json(route, { code: 'admin_forbidden', message: 'Acesso administrativo não permitido.' }, 403); return true;
  } });
  await page.goto(accountPath); await expect(page.getByText('Pessoa de metadados', { exact: true }).first()).toBeVisible(); hold = true;
  await page.evaluate(() => window.dispatchEvent(new Event('focus'))); await expect.poll(() => !!release).toBe(true);
  await expect(page.getByText('Pessoa de metadados', { exact: true }).first()).not.toBeVisible(); state.grant = false; release!();
  await expect(page.getByRole('heading', { name: 'Acesso administrativo indisponível', exact: true })).toBeVisible();
});
test('troca de conta descarta motivo e respostas do administrador anterior', async ({ page }) => {
  const { auth, state } = await mockAdmin(page); await page.goto(accountPath);
  await page.getByRole('button', { name: 'Bloquear acesso por segurança', exact: true }).click(); await page.getByLabel('Motivo administrativo', { exact: true }).fill('Motivo só em memória');
  auth.userId = ids.bia; state.grant = false; await page.evaluate(() => window.dispatchEvent(new Event('meumimo:session-changed')));
  await expect(page.getByLabel('Motivo administrativo', { exact: true })).not.toBeVisible(); await expect(page.getByText('Pessoa de metadados', { exact: true }).first()).not.toBeVisible();
});

test('entrada em Conta só aparece depois da verificação administrativa', async ({ page }) => {
  const { state } = await mockAdmin(page); await page.goto('/conta'); await expect(page.getByRole('link', { name: 'Abrir administração', exact: true })).toBeVisible();
  state.grant = false; await page.reload(); await expect(page.getByRole('link', { name: 'Abrir administração', exact: true })).toHaveCount(0);
});
