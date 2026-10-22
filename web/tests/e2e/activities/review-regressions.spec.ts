import { expect } from '@playwright/test';
import { mockActivities, registerPath, rootPath, test } from './helpers';
import { json } from '../stores/helpers';

test('401 durante envio revalida sessão sem focus e preserva o mesmo rascunho no retorno', async ({ page }) => {
  let expired = false;
  await mockActivities(page, { handler: async (route, url) => {
    if (url.pathname.endsWith('/enviar')) {
      expired = true;
      await json(route, { code: 'session_invalid', message: 'Sua sessão expirou. Entre novamente.' }, 401); return true;
    }
    if (expired && url.pathname === '/api/auth/session') {
      await json(route, { code: 'session_invalid', message: 'Entre novamente na sua conta.' }, 401); return true;
    }
    return false;
  } });
  await page.goto(registerPath);
  await expect(page.getByRole('button', { name: 'Enviar registro', exact: true })).toBeEnabled();
  const destination = new URL(page.url());
  const draftId = destination.searchParams.get('rascunho'); expect(draftId).toBeTruthy();
  await page.getByRole('textbox', { name: 'Legenda (opcional)', exact: true }).fill('Legenda privada da sessão que expirou.');
  await page.getByRole('button', { name: 'Enviar registro', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Acesse sua conta', exact: true })).toBeVisible();
  const login = page.getByRole('link', { name: 'Entrar na conta', exact: true });
  await expect(login).toBeVisible();
  const returnTo = new URL((await login.getAttribute('href'))!, page.url()).searchParams.get('returnTo');
  expect(returnTo).toBe(`${destination.pathname}?rascunho=${draftId}`);
  await expect(page.getByRole('textbox', { name: 'Legenda (opcional)', exact: true })).toHaveCount(0);
  await expect(page.getByText('Legenda privada da sessão que expirou.', { exact: true })).toHaveCount(0);
});

test('404 durante envio permanece acesso indisponível sem sugerir nova autenticação', async ({ page }) => {
  let sessionReads = 0;
  await mockActivities(page, { handler: async (route, url) => {
    if (url.pathname === '/api/auth/session') sessionReads += 1;
    if (url.pathname.endsWith('/enviar')) {
      await json(route, { code: 'resource_not_found', message: 'Conteúdo indisponível.' }, 404); return true;
    }
    return false;
  } });
  await page.goto(registerPath);
  await expect(page.getByRole('button', { name: 'Enviar registro', exact: true })).toBeEnabled();
  const readsBefore = sessionReads;
  await page.getByRole('button', { name: 'Enviar registro', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Acesso indisponível', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Entrar na conta', exact: true })).toHaveCount(0);
  expect(sessionReads).toBe(readsBefore);
});

test('nome com 81 caracteres preserva campos e associa erro ao primeiro campo inválido', async ({ page }) => {
  const { state } = await mockActivities(page, { merchant: true });
  await page.goto(`${rootPath}/nova`);
  const name = page.getByLabel('Nome da atividade', { exact: true });
  await name.fill('A'.repeat(81));
  await page.getByRole('textbox', { name: 'Descrição', exact: true }).fill('Descrição válida preservada.');
  await page.getByLabel('Categoria (opcional)', { exact: true }).fill('Categoria válida');
  await page.getByLabel('Pontos por conquista aprovada', { exact: true }).fill('20');
  await page.getByRole('button', { name: 'Salvar atividade', exact: true }).click();
  await expect(name).toBeFocused(); await expect(name).toHaveAttribute('aria-invalid', 'true');
  await expect(name).toHaveAccessibleDescription(/Use até 80 caracteres no nome da atividade/);
  await expect(name).toHaveValue('A'.repeat(81));
  await expect(page.getByRole('textbox', { name: 'Descrição', exact: true })).toHaveValue('Descrição válida preservada.');
  expect(state.activityBodies).toHaveLength(0);
  await name.fill('Nome corrigido');
  await expect(name).not.toHaveAttribute('aria-invalid', 'true');
  await page.getByRole('button', { name: 'Salvar atividade', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Nome corrigido', exact: true })).toBeVisible();
});
