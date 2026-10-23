import { expect, test as base } from '@playwright/test';
import type { Page } from '@playwright/test';

const test = base.extend<{ pageHealth: void }>({
  pageHealth: [async ({ page }, use) => {
    const runtimeErrors: string[] = [];
    const serviceRequests: string[] = [];

    page.on('pageerror', error => runtimeErrors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error') runtimeErrors.push(message.text());
    });
    page.on('request', request => {
      const url = new URL(request.url());
      const servicePath = /^\/(auth|rest|storage|realtime)\/v1(?:\/|$)/;
      if (url.hostname.includes('supabase') ||
          ['54321', '54322'].includes(url.port) ||
          servicePath.test(url.pathname)) {
        serviceRequests.push(request.url());
      }
    });

    await use();

    expect(runtimeErrors, 'A fundação deve carregar sem erros de navegador.').toEqual([]);
    expect(serviceRequests, 'T01 deve funcionar sem consultar serviços de dados.').toEqual([]);
  }, { auto: true }],
});

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
  }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport + 1);
}

test('abre a fundação em português sem serviços de conta ou banco', async ({ page }) => {
  const response = await page.goto('/');

  expect(response?.status()).toBe(200);
  await expect(page).toHaveTitle(/Meu Mimo/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sua lojinha de carinho.');
  await expect(page.getByText(
    'Um cantinho para celebrar conquistas e transformar pontos em momentos especiais.',
  )).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: test.info().outputPath('foundation.png'), fullPage: true });
});

test('oferece a demonstração por um alvo de toque e teclado alcançável', async ({ page }) => {
  await page.goto('/');
  const demonstration = page.getByRole('link', { name: 'Conhecer a demonstração' });

  await expect(demonstration).toHaveAttribute(
    'href', 'https://meu-mimo-carinho.rafael-giustina2.chatgpt.site/',
  );
  const bounds = await demonstration.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.width).toBeGreaterThanOrEqual(44);
  expect(bounds!.height).toBeGreaterThanOrEqual(44);

  for (let attempt = 0; attempt < 8; attempt += 1) {
    await page.keyboard.press('Tab');
    if (await demonstration.evaluate(element => element === document.activeElement)) break;
  }
  await expect(demonstration).toBeFocused();
  const visibleFocus = await demonstration.evaluate(element => {
    const style = getComputedStyle(element);
    const outline = style.outlineStyle !== 'none' && Number.parseFloat(style.outlineWidth) > 0;
    return element.matches(':focus-visible') && (outline || style.boxShadow !== 'none');
  });
  expect(visibleFocus, 'O foco obtido por Tab precisa ter uma indicação visível.').toBe(true);
});

test('mantém conteúdo e ação utilizáveis com texto ampliado a 200%', async ({ page }) => {
  await page.goto('/');
  const description = page.getByText(
    'Um cantinho para celebrar conquistas e transformar pontos em momentos especiais.',
  );
  const originalSize = await description.evaluate(element =>
    Number.parseFloat(getComputedStyle(element).fontSize));

  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });

  const enlargedSize = await description.evaluate(element =>
    Number.parseFloat(getComputedStyle(element).fontSize));
  expect(enlargedSize).toBeGreaterThanOrEqual(originalSize * 1.99);
  await page.locator('.ui-points').screenshot({ path: test.info().outputPath('potinho-text-200.png') });
  const labelLines = await page.locator('.ui-points-available dt').evaluate(element => {
    const range = document.createRange(); range.selectNodeContents(element);
    return range.getClientRects().length;
  });
  expect(labelLines, 'O rótulo Disponíveis deve continuar legível sem partir a palavra.').toBe(1);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const demonstration = page.getByRole('link', { name: 'Conhecer a demonstração' });
  await demonstration.scrollIntoViewIfNeeded();
  await expect(demonstration).toBeInViewport();
  const textFitsAction = await demonstration.evaluate(element => {
    const action = element.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(element);
    return Array.from(range.getClientRects()).every(rect =>
      rect.left >= action.left - 1 && rect.right <= action.right + 1);
  });
  expect(textFitsAction, 'O rótulo completo deve caber na superfície da ação.').toBe(true);
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: test.info().outputPath('foundation-text-200.png'), fullPage: true });
});

test('respeita a preferência de movimento reduzido', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');

  expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);
  await expect.poll(() => page.evaluate(() => document.getAnimations()
    .filter(animation => animation.playState === 'running' || animation.pending).length))
    .toBe(0);
  await expect(page.getByRole('link', { name: 'Conhecer a demonstração' })).toBeVisible();
});
