import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const identity = { userId: '11111111-1111-4111-8111-111111111111', sessionId: '22222222-2222-4222-8222-222222222222', assuranceLevel: 'aal1', recovery: false };
const denied = { code: 'identity_missing', message: 'Entre novamente.' };
async function guest(page: Page) {
  await page.route('**/api/auth/session', route => route.fulfill({ status: 401, json: denied }));
  await page.goto('/conta?returnTo=%2Fconvites%2Fmeu-convite');
  await expect(page.getByLabel('E-mail', { exact: true })).toBeEnabled();
}
const nav = (page: Page) => page.getByRole('navigation', { name: 'Acesso à conta' });
const form = (page: Page) => page.locator('.account-form');

test('desktop distingue acesso e cadastro, com ação principal visível e stickers locais', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await guest(page);
  const card = await page.locator('.account-card').boundingBox();
  const presentation = await page.locator('.account-header').boundingBox();
  expect(card!.x).toBeGreaterThan(presentation!.x + presentation!.width);
  await expect(form(page).getByRole('button', { name: 'Entrar', exact: true })).toBeInViewport();
  await expect(nav(page).getByRole('button')).toHaveCount(2);
  await expect(page.locator('.account-collage img')).toHaveCount(3);
  expect(await page.locator('.account-collage img').evaluateAll(images => images.every(image => image.getAttribute('alt') === ''))).toBe(true);
  await page.screenshot({ path: test.info().outputPath('login-desktop.png'), fullPage: true });
  await nav(page).getByRole('button', { name: 'Criar conta', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Crie sua conta' })).toBeVisible();
  await expect(page.getByText('Você vai receber um e-mail para confirmar sua conta antes de entrar.')).toBeVisible();
  await expect(form(page).getByRole('button', { name: 'Criar conta', exact: true })).toBeInViewport();
  await page.screenshot({ path: test.info().outputPath('signup-desktop.png'), fullPage: true });
});

test('cadastro impede repetição pendente e explica confirmação, com correção de e-mail', async ({ page }) => {
  let release!: () => void; const pending = new Promise<void>(resolve => { release = resolve; });
  let requests = 0;
  await page.route('**/api/auth/signup', async route => {
    requests++;
    expect(route.request().postDataJSON()).toMatchObject({ email: 'pessoa@example.test', returnTo: '/convites/meu-convite' });
    await pending;
    await route.fulfill({ status: 202, json: { message: 'Se os dados estiverem corretos, confira seu e-mail.' } });
  });
  await guest(page); await nav(page).getByRole('button', { name: 'Criar conta', exact: true }).click();
  await page.getByLabel('E-mail', { exact: true }).fill('pessoa@example.test');
  await page.getByLabel('Senha', { exact: true }).fill('CadastroLocal!123');
  await form(page).getByRole('button', { name: 'Criar conta', exact: true }).click();
  const submitting = form(page).getByRole('button', { name: 'Só um instante…' });
  await expect(submitting).toHaveAttribute('aria-disabled', 'true');
  await expect(submitting).toBeFocused();
  await submitting.press('Enter'); await submitting.press('Enter');
  expect(requests).toBe(1); release();
  const heading = page.getByRole('heading', { name: 'Confira seu e-mail' });
  await expect(heading).toBeFocused();
  await expect(page.getByText('Se os dados estiverem corretos, confira seu e-mail.', { exact: true })).toBeVisible();
  await expect(page.locator('.account-mail-sent')).toContainText('pessoa@example.test');
  await expect(form(page)).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath('signup-sent.png'), fullPage: true });
  await page.getByRole('button', { name: 'Corrigir e-mail' }).click();
  await expect(page.getByRole('heading', { name: 'Crie sua conta' })).toBeFocused();
  await expect(page.getByLabel('E-mail', { exact: true })).toHaveValue('pessoa@example.test');
  await expect(page.getByLabel('Senha', { exact: true })).toHaveValue('');
  expect(requests).toBe(1);
});

test('senha permite consulta, preserva rascunho após revalidação e erro permite tentar novamente', async ({ page }) => {
  await guest(page);
  const password = page.getByLabel('Senha', { exact: true });
  await page.getByLabel('E-mail', { exact: true }).fill('pessoa@example.test');
  await password.fill('MinhaSenha!123');
  await page.getByRole('button', { name: 'Mostrar senha', exact: true }).click();
  await expect(password).toHaveAttribute('type', 'text');
  await expect(password).toHaveAttribute('autocomplete', 'current-password');
  await page.getByRole('button', { name: 'Ocultar senha', exact: true }).press('Enter');
  await expect(password).toHaveAttribute('type', 'password');
  const checked = page.waitForResponse('**/api/auth/session');
  await page.evaluate(() => window.dispatchEvent(new Event('focus'))); await checked;
  await expect(password).toHaveValue('MinhaSenha!123');
  await page.route('**/api/auth/login', route => route.fulfill({ status: 401, json: { code: 'login_failed', message: 'Não foi possível entrar com esses dados.' } }));
  await form(page).getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.locator('#account-error')).toHaveText('Não foi possível entrar com esses dados.');
  await expect(password).toHaveValue('MinhaSenha!123');
  await expect(form(page).getByRole('button', { name: 'Entrar', exact: true })).toHaveAttribute('aria-disabled', 'false');
  await page.getByRole('button', { name: 'Recuperar senha', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Recupere seu acesso' })).toBeFocused();
  await expect(password).toHaveCount(0);
  await page.getByRole('button', { name: 'Voltar para entrar' }).click();
  await expect(password).toHaveValue('');
  await expect(page.locator('#account-error')).toBeEmpty();
});

test('login conserva o destino interno confirmado pelo servidor', async ({ page }) => {
  await guest(page);
  await page.route('**/api/auth/session', route => route.fulfill({ json: identity }));
  await page.route('**/api/auth/login', route => route.fulfill({ json: { returnTo: '/convites/meu-convite' } }));
  await page.route('**/convites/meu-convite', route => route.fulfill({ contentType: 'text/html', body: '<main>Destino confirmado</main>' }));
  await page.getByLabel('E-mail', { exact: true }).fill('pessoa@example.test');
  await page.getByLabel('Senha', { exact: true }).fill('SenhaLocal!123');
  await form(page).getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL(/\/convites\/meu-convite$/);
});

test('recuperação restrita só oferece nova senha, com feedback e retorno à conta', async ({ page }) => {
  let recovery = true;
  await page.route('**/api/auth/session', route => route.fulfill({ json: { ...identity, recovery } }));
  await page.route('**/api/auth/recovery', route => {
    expect(route.request().method()).toBe('PATCH'); recovery = false;
    return route.fulfill({ json: { message: 'Sua senha foi atualizada.' } });
  });
  await page.goto('/conta?recuperacao=1');
  await expect(nav(page)).toHaveCount(0);
  await expect(page.getByLabel('E-mail', { exact: true })).toHaveCount(0);
  const password = page.getByLabel('Nova senha', { exact: true });
  await expect(password).toHaveAttribute('autocomplete', 'new-password');
  await password.fill('Recuperada!123');
  await page.getByRole('button', { name: 'Salvar nova senha' }).click();
  await expect(page.getByText('Sua senha foi atualizada.', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Sua conta', exact: true })).toBeFocused();
  await expect(page.getByRole('link', { name: 'Minhas lojas' })).toBeVisible();
  await expect(password).toHaveCount(0);
});

test('link confirmado em outra aba substitui o estado de e-mail e logout remoto limpa o fluxo', async ({ page }) => {
  let current: typeof identity | null = null;
  await page.route('**/api/auth/session', route => route.fulfill({ status: current ? 200 : 401, json: current ?? denied }));
  await page.route('**/api/auth/recovery', route => route.fulfill({ status: 202, json: { message: 'Se os dados estiverem corretos, confira seu e-mail.' } }));
  await page.goto('/conta');
  await page.getByRole('button', { name: 'Recuperar senha', exact: true }).click();
  await page.getByLabel('E-mail', { exact: true }).fill('pessoa@example.test');
  await page.getByRole('button', { name: 'Enviar link de recuperação', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Confira seu e-mail' })).toBeVisible();
  current = { ...identity, recovery: true };
  await page.evaluate(() => window.dispatchEvent(new Event('meumimo:session-changed')));
  await expect(page.getByLabel('Nova senha', { exact: true })).toBeVisible();
  await expect(page.locator('.account-mail-sent')).toHaveCount(0);
  current = null;
  await page.evaluate(() => window.dispatchEvent(new Event('meumimo:session-changed')));
  await expect(page.getByRole('heading', { name: 'Entre no seu cantinho' })).toBeVisible();
  await expect(page.getByLabel('E-mail', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Senha', { exact: true })).toHaveValue('');
  await expect(page.locator('.account-mail-sent')).toHaveCount(0);
});

test('login padrão e saída conduzem foco ao título depois de revalidar a sessão', async ({ page }) => {
  let loggedIn = false;
  await page.route('**/api/auth/session', route => route.fulfill({ status: loggedIn ? 200 : 401, json: loggedIn ? identity : denied }));
  await page.route('**/api/auth/login', route => { loggedIn = true; return route.fulfill({ json: { returnTo: '/conta' } }); });
  await page.route('**/api/auth/logout', route => { loggedIn = false; return route.fulfill({ json: {} }); });
  await page.goto('/conta');
  await page.getByLabel('E-mail', { exact: true }).fill('pessoa@example.test');
  await page.getByLabel('Senha', { exact: true }).fill('SenhaLocal!123');
  await form(page).getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Sua conta', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Sair da conta', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Entre no seu cantinho' })).toBeFocused();
  await expect(page.getByLabel('E-mail', { exact: true })).toHaveValue('');
});
