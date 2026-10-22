import { expect } from '@playwright/test';
import { flushView, ids, json, mockApi, noOverflow, store, test } from './helpers';

test('logout descarta perfil, rascunho e resposta atrasada antes de outra conta entrar', async ({ page }) => {
  let release: (() => void) | undefined;
  const delayed = new Promise<void>(resolve => { release = resolve; });
  let finish: (() => void) | undefined;
  const delivered = new Promise<void>(resolve => { finish = resolve; });
  let saving = false;
  const state = await mockApi(page, async (route, url) => {
    if (url.pathname !== '/api/perfil' || route.request().method() !== 'PATCH') return false;
    saving = true;
    const displayName = route.request().postDataJSON().displayName as string;
    await delayed;
    await json(route, { id: ids.ana, displayName }).catch(() => {});
    finish!();
    return true;
  });
  await page.goto('/conta');
  const name = page.getByRole('textbox', { name: 'Seu nome', exact: true });
  await expect(name).toHaveValue('Ana privada');
  await name.fill('Rascunho privado da Ana');
  await page.getByRole('button', { name: 'Salvar nome', exact: true }).click();
  await expect.poll(() => saving).toBe(true);
  await page.getByRole('button', { name: 'Sair da conta', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'E-mail', exact: true })).toHaveValue('');
  await expect(name).toHaveCount(0);
  release!();
  await delivered;
  await flushView(page);
  await expect(page.getByText('Rascunho privado da Ana', { exact: true })).toHaveCount(0);
  state.loggedIn = true;
  state.userId = ids.bia;
  state.displayName = 'Bia privada';
  await page.goto('/conta');
  await expect(page.getByRole('textbox', { name: 'Seu nome', exact: true })).toHaveValue('Bia privada');
  expect(await page.locator('body').innerText()).not.toContain('Ana privada');
  const storage = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }));
  expect(storage).not.toContain('Rascunho privado da Ana');
  expect(storage).not.toContain('Ana privada');
  await noOverflow(page);
});

test('logout em outra aba limpa o e-mail e troca de conta descarta a árvore montada', async ({ page, context }) => {
  const state = await mockApi(page, async (route, url, current) => {
    if (url.pathname !== '/api/auth/login') return false;
    current.loggedIn = true;
    await json(route, { returnTo: '/conta' });
    return true;
  });
  state.loggedIn = false;
  await page.goto('/conta');
  await page.getByRole('textbox', { name: 'E-mail', exact: true }).fill('ana@example.test');
  await page.getByLabel('Senha', { exact: true }).fill('SenhaLocal!123');
  await page.getByRole('button', { name: 'Entrar', exact: true }).last().click();
  await expect(page.getByRole('textbox', { name: 'Seu nome', exact: true })).toHaveValue('Ana privada');
  const other = await context.newPage();
  await other.goto('/');
  state.loggedIn = false;
  await other.evaluate(() => {
    const channel = new BroadcastChannel('meumimo-session');
    channel.postMessage('changed'); channel.close();
  });
  await expect(page.getByRole('textbox', { name: 'E-mail', exact: true })).toHaveValue('');
  await expect(page.getByRole('textbox', { name: 'Seu nome', exact: true })).toHaveCount(0);
  state.loggedIn = true; state.userId = ids.bia; state.displayName = 'Bia privada';
  await other.evaluate(() => {
    const channel = new BroadcastChannel('meumimo-session');
    channel.postMessage('changed'); channel.close();
  });
  await expect(page.getByRole('textbox', { name: 'Seu nome', exact: true })).toHaveValue('Bia privada');
  expect(await page.locator('body').innerText()).not.toContain('Ana privada');
  await other.close();
});

test('central oculta a conta anterior durante revalidação e descarta busca ao trocar sessão', async ({ page }) => {
  let release: (() => void) | undefined;
  const pending = new Promise<void>(resolve => { release = resolve; });
  let checking = false;
  let requested = false;
  const state = await mockApi(page, async (route, url, current) => {
    if (url.pathname !== '/api/auth/session' || !checking) return false;
    requested = true;
    await pending;
    await json(route, { userId: current.userId, sessionId: current.userId, assuranceLevel: 'aal1', recovery: false });
    return true;
  });
  await page.goto('/lojas');
  await expect(page.getByRole('heading', { name: 'Loja da Ana', exact: true })).toBeVisible();
  await page.getByRole('searchbox', { name: 'Buscar loja' }).fill('Busca privada da Ana');
  checking = true;
  state.userId = ids.bia;
  state.stores = [store({ id: ids.second, name: 'Loja da Bia' })];
  await page.evaluate(() => window.dispatchEvent(new Event('meumimo:session-changed')));
  await expect.poll(() => requested).toBe(true);
  await expect(page.getByRole('heading', { name: 'Loja da Ana', exact: true })).not.toBeVisible();
  release!();
  await expect(page.getByRole('heading', { name: 'Loja da Bia', exact: true })).toBeVisible();
  await expect(page.getByRole('searchbox', { name: 'Buscar loja' })).toHaveValue('');
  await expect(page.getByRole('heading', { name: 'Loja da Ana', exact: true })).toHaveCount(0);
});
