import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import type { BrowserContext } from '@playwright/test';
import { pilotFixture, login, createStore, personPage, createActivity, invite, closeContexts } from './helpers';
import { localMailLink, logout, syntheticAccount, noHorizontalOverflow, waitForDomainBudget } from './helper-auth';

test('cadastro e recuperação de senha atravessam UI, Mailpit, Auth e banco reais', async ({ browser }) => {
  test.setTimeout(180_000);
  const f = await pilotFixture(); const contexts: BrowserContext[] = [];
  try {
    const account = syntheticAccount(); f.trackEmail(account.email);
    const context = await browser.newContext({ baseURL: f.environment.origin, viewport: { width: 320, height: 800 }, reducedMotion: 'reduce' });
    contexts.push(context); const page = await context.newPage(); await page.goto('/conta');
    await page.getByRole('navigation', { name: 'Acesso à conta' }).getByRole('button', { name: 'Criar conta', exact: true }).click();
    await page.getByLabel('E-mail', { exact: true }).fill(account.email);
    await page.getByLabel('Senha', { exact: true }).fill(account.password);
    const signup = page.waitForResponse(response => response.url().endsWith('/api/auth/signup') && response.request().method() === 'POST');
    await page.locator('form').getByRole('button', { name: 'Criar conta', exact: true }).click();
    expect((await signup).status()).toBe(202);
    await expect(page.getByRole('heading', { name: 'Confira seu e-mail' })).toBeFocused();
    await expect(page.getByText('Se os dados estiverem corretos, confira seu e-mail.', { exact: true })).toBeVisible();
    await expect(page.getByText('Você está na sua conta', { exact: true })).toHaveCount(0);
    expect((await page.request.get('/api/auth/session')).status()).toBe(401);
    await page.goto(await localMailLink(f.environment, account.email, 'signup'));
    await expect(page.getByText('Você está na sua conta', { exact: true })).toBeVisible();
    const initial = await (await page.request.get('/api/auth/session')).json() as { userId: string; recovery: boolean };
    expect(initial.userId).toMatch(/^[a-f0-9-]{36}$/); expect(initial.recovery).toBe(false);
    const verified = await f.auth.auth.admin.getUserById(initial.userId);
    expect(verified.error).toBeNull(); expect(verified.data.user?.email_confirmed_at).toBeTruthy();
    // Marca somente a conta que acabou de ser cadastrada e confirmada pela UI.
    const marked = await f.auth.auth.admin.updateUserById(initial.userId,
      { app_metadata: { local_fixture: 'meumimo-t14', fixture_run: randomUUID() } });
    expect(marked.error).toBeNull();
    expect((await f.database.query('SELECT id FROM app."Profile" WHERE id=$1', [initial.userId])).rowCount).toBe(1);
    const storeId = await createStore(page, f.trackStore);
    await waitForDomainBudget(f.database, initial.userId);
    await logout(page);
    await page.getByRole('button', { name: 'Recuperar senha', exact: true }).click();
    await page.getByLabel('E-mail', { exact: true }).fill(account.email);
    const requested = page.waitForResponse(response => response.url().endsWith('/api/auth/recovery') && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Enviar link de recuperação', exact: true }).click();
    expect((await requested).status()).toBe(202);
    await page.goto(await localMailLink(f.environment, account.email, 'recovery'));
    await expect(page.getByLabel('Nova senha', { exact: true })).toBeVisible();
    const restricted = await (await page.request.get('/api/auth/session')).json() as { sessionId: string; recovery: boolean };
    expect(restricted.recovery).toBe(true);
    const denied = await page.request.get(`/api/lojas/${storeId}`);
    expect(denied.status()).toBe(403); expect((await denied.json()).code).toBe('recovery_required');
    await page.goto(`/lojas/${storeId}`);
    await expect(page.getByRole('heading', { name: 'Conclua a recuperação', exact: true })).toBeVisible();
    await page.goto('/conta'); const password = `Recuperada!${randomUUID()}`;
    await page.getByLabel('Nova senha', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Salvar nova senha', exact: true }).click();
    await expect(page.getByText('Sua senha foi atualizada.', { exact: true })).toBeVisible();
    expect((await f.database.query('SELECT recovery FROM app."AuthSession" WHERE id=$1', [restricted.sessionId])).rows[0].recovery).toBe(false);
    await logout(page);
    await page.getByLabel('E-mail', { exact: true }).fill(account.email);
    await page.getByLabel('Senha', { exact: true }).fill(account.password);
    await page.locator('form').getByRole('button', { name: 'Entrar', exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Não foi possível entrar com esses dados.' })).toBeVisible();
    await login(page, { id: initial.userId, email: account.email, password });
    await page.goto(`/lojas/${storeId}`); await expect(page.getByRole('heading', { name: 'Resumo da sua loja', exact: true })).toBeVisible();
    await noHorizontalOverflow(page);
    expect((await f.database.query('SELECT "createdByProfileId" FROM app."Store" WHERE id=$1', [storeId])).rows[0].createdByProfileId).toBe(initial.userId);
  } finally { await closeContexts(contexts); await f.cleanup(); }
});

test('logout em outra aba descarta o rascunho privado antes de trocar de conta', async ({ browser }) => {
  const f = await pilotFixture(); const contexts: BrowserContext[] = [];
  try {
    const ownerPerson = await f.createUser(); const anaPerson = await f.createUser(); const otherPerson = await f.createUser();
    const owner = await personPage(browser, ownerPerson); contexts.push(owner.context);
    const ana = await personPage(browser, anaPerson); contexts.push(ana.context);
    const storeId = await createStore(owner.page, f.trackStore); await invite(owner.page, ana.page, storeId);
    const activityId = await createActivity(owner.page, storeId);
    await ana.page.goto(`/lojas/${storeId}/atividades/${activityId}/registrar`);
    const marker = `Rascunho privado ${randomUUID()}`;
    await ana.page.getByLabel('Legenda (opcional)', { exact: true }).fill(marker);
    const accountTab = await ana.context.newPage(); await logout(accountTab);
    await ana.page.bringToFront();
    await expect(ana.page.getByRole('heading', { name: 'Acesse sua conta', exact: true })).toBeVisible();
    expect(await ana.page.content()).not.toContain(marker);
    await login(ana.page, otherPerson); await ana.page.goto(`/lojas/${storeId}/atividades/${activityId}/registrar`);
    await expect(ana.page.getByRole('heading', { name: 'Mimos indisponíveis', exact: true })).toBeVisible();
    expect(await ana.page.content()).not.toContain(marker);
    expect((await f.database.query('SELECT count(*)::int n FROM app."ActivitySubmission" WHERE "storeId"=$1 AND "receivedAt" IS NOT NULL', [storeId])).rows[0].n).toBe(0);
  } finally { await closeContexts(contexts); await f.cleanup(); }
});
