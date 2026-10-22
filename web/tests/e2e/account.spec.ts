import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

// Respostas controladas verificam estados da interface. Auth real é provado
// separadamente por HTTP em tests/integration, contra a stack Supabase local.
async function guest(page: Page) {
  await page.route('**/api/auth/session', route => route.fulfill({
    status: 401, contentType: 'application/json',
    body: JSON.stringify({ code: 'identity_missing', message: 'Entre novamente.' }),
  }));
  await page.goto('/conta');
  await expect(page.getByRole('button', { name: 'Entrar', exact: true }).first()).toBeEnabled();
}

async function noOverflow(page: Page) {
  expect(await page.evaluate(() => Math.max(document.body.scrollWidth,
    document.documentElement.scrollWidth) <= document.documentElement.clientWidth + 1)).toBe(true);
}

test('conta oferece rótulos, teclado e alvos de toque em celular', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await guest(page);
  await expect(page.getByRole('heading', { name: 'Vamos começar?' })).toBeVisible();
  const email = page.getByRole('textbox', { name: 'E-mail', exact: true });
  const password = page.getByLabel('Senha', { exact: true });
  await page.getByRole('button', { name: 'Recuperar senha', exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(email).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(password).toBeFocused();
  expect(await password.evaluate(element => {
    const style = getComputedStyle(element);
    return element.matches(':focus-visible') && style.outlineStyle !== 'none';
  })).toBe(true);
  for (const button of await page.getByRole('button').all()) {
    const bounds = await button.boundingBox();
    expect(bounds!.height).toBeGreaterThanOrEqual(44);
    expect(bounds!.width).toBeGreaterThanOrEqual(44);
  }
  await noOverflow(page);
  expect(errors).toEqual([]);
  await page.screenshot({ path: test.info().outputPath('account.png'), fullPage: true });
});

test('conta mantém orientação e erro acessíveis nos três formulários', async ({ page }) => {
  await guest(page);
  await page.getByRole('button', { name: 'Criar conta', exact: true }).first().click();
  await expect(page.getByLabel('Senha', { exact: true })).toHaveAttribute('minlength', '8');
  await expect(page.getByText('Use pelo menos oito caracteres.')).toBeVisible();
  await page.getByRole('button', { name: 'Recuperar senha', exact: true }).click();
  await expect(page.getByLabel('Senha', { exact: true })).toHaveCount(0);
  await page.route('**/api/auth/recovery', route => route.fulfill({
    status: 429, contentType: 'application/json',
    body: JSON.stringify({ code: 'auth_rate_limited', message: 'Aguarde um pouco antes de tentar novamente.' }),
  }));
  await page.getByRole('textbox', { name: 'E-mail', exact: true }).fill('pessoa@example.test');
  await page.getByRole('button', { name: 'Enviar link de recuperação', exact: true }).click();
  await expect(page.locator('#account-error')).toHaveText('Aguarde um pouco antes de tentar novamente.');
  await expect(page.getByRole('button', { name: 'Enviar link de recuperação', exact: true })).toBeEnabled();
  await noOverflow(page);
});

test('conta suporta texto 200% e movimento reduzido', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await guest(page);
  const email = page.getByRole('textbox', { name: 'E-mail', exact: true });
  const originalSize = await email.evaluate(element => Number.parseFloat(getComputedStyle(element).fontSize));
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  expect(await email.evaluate(element => Number.parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(originalSize * 1.99);
  await page.getByRole('button', { name: 'Recuperar senha', exact: true }).click();
  const action = page.getByRole('button', { name: 'Enviar link de recuperação', exact: true });
  await action.scrollIntoViewIfNeeded();
  await expect(action).toBeInViewport();
  expect(await action.evaluate(element => {
    const bounds = element.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(element);
    return Array.from(range.getClientRects()).every(rect => rect.left >= bounds.left - 1 && rect.right <= bounds.right + 1);
  })).toBe(true);
  await noOverflow(page);
  expect(await page.evaluate(() => document.getAnimations().filter(animation => animation.playState === 'running').length)).toBe(0);
  await page.screenshot({ path: test.info().outputPath('account-200.png'), fullPage: true });
});

test('MFA renderiza o QR entregue pelo SDK e permite consultar a chave manual', async ({ page }) => {
  await page.route('**/api/auth/session', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({
      userId: '11111111-1111-4111-8111-111111111111',
      sessionId: '22222222-2222-4222-8222-222222222222', assuranceLevel: 'aal1', recovery: false,
    }),
  }));
  await page.route('**/api/auth/mfa', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify(route.request().method() === 'GET' ?
      { factors: [] } : {
        factorId: '33333333-3333-4333-8333-333333333333',
        qrCode: 'data:image/svg+xml;utf-8,<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240"><rect width="240" height="240" fill="#000"/></svg>',
        secret: 'CHAVEFICTICIA',
      }),
  }));
  await page.goto('/conta');
  await page.getByRole('button', { name: 'Configurar aplicativo autenticador' }).click();
  const qr = page.getByRole('img', { name: 'Código QR para adicionar o Meu Mimo ao aplicativo autenticador' });
  await expect(qr).toBeVisible();
  await expect.poll(() => qr.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBe(240);
  const key = page.getByLabel('Chave para configuração manual');
  await expect(key).toHaveAttribute('type', 'password');
  await page.getByRole('button', { name: 'Mostrar chave' }).click();
  await expect(key).toHaveAttribute('type', 'text');
  await expect(key).toHaveValue('CHAVEFICTICIA');
  await noOverflow(page);
});
