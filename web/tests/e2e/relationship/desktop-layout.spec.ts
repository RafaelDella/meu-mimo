import { expect } from '@playwright/test';
import { test, mockRelationship, home, noOverflow, json, ids } from './helpers';
import { mockRewards } from '../redemptions/helpers';
import { mockActivities, rootPath } from '../activities/helpers';

test.describe('Organização desktop da loja', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  for (const merchant of [false, true]) {
    test(`navegação compacta e acessível com nome longo: ${merchant ? 'lojista' : 'participante'}`, async ({ page }) => {
      const { state } = await mockRelationship(page, { merchant });
      state.store.name = 'Um cantinho de carinho para celebrar todas as pequenas conquistas da nossa história'.slice(0, 80);
      await page.goto(home);
      const heading = page.getByRole('heading', { name: state.store.name, exact: true });
      await expect(heading).toBeVisible();
      expect(await heading.evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeLessThanOrEqual(20);
      const navigation = page.getByRole('navigation', { name: merchant ? 'Gestão da loja' : 'Sua participação', exact: true });
      for (const link of await navigation.getByRole('link').all()) {
        expect((await link.boundingBox())!.height).toBeLessThanOrEqual(56);
      }
      const finalLink = page.getByRole('link', { name: merchant ? 'Configurações' : 'Extrato', exact: true });
      await finalLink.focus();
      await expect(finalLink).toBeInViewport();
      expect(await finalLink.evaluate(el => getComputedStyle(el).outlineStyle)).toBe('solid');
      await noOverflow(page);
    });
  }

  test('a vitrine aparece na primeira tela e antecede os resumos de apoio', async ({ page }, testInfo) => {
    await mockRewards(page);
    await page.goto(home);
    const reward = page.getByRole('link', { name: /Ver mimo\s*:\s*Café da ocasião/ });
    await expect(reward).toBeVisible();
    await page.locator('img').evaluateAll(images => Promise.all(images.map(image => (image as HTMLImageElement).decode())));
    await page.screenshot({ path: `.artifacts/desktop-lojinha-${testInfo.project.name}.png`, fullPage: true });
    await expect(reward).toBeInViewport({ ratio: 1 });
    const showcase = await page.getByRole('heading', { name: 'Vitrine de mimos', exact: true }).boundingBox();
    const today = await page.getByRole('heading', { name: 'Hoje nesta loja', exact: true }).boundingBox();
    expect(showcase!.y).toBeLessThan(today!.y);
    await expect(page.getByRole('region', { name: 'Seu potinho de pontos', exact: true })).toContainText('Disponíveis');
    await expect(page.getByRole('region', { name: 'Seu potinho de pontos', exact: true })).toContainText('Em análise');
    await noOverflow(page);
  });

  test('atividades ficam à frente do resumo e o saldo extenso continua exato', async ({ page }, testInfo) => {
    await mockActivities(page);
    await page.goto(rootPath);
    const activity = page.getByRole('link', { name: /Ver atividade\s*:\s*Ler algumas páginas/ });
    await expect(activity).toBeVisible();
    await expect(activity).toBeInViewport();
    const support = page.getByRole('region', { name: 'Pontos e conquistas nesta loja', exact: true });
    await expect(support).toContainText('9.007.199.254.740.993');
    const catalog = page.getByRole('heading', { name: 'Atividades para registrar', exact: true });
    expect(await catalog.evaluate((el, label) => {
      const summary = document.querySelector(`section[aria-label="${label}"]`);
      return !!summary && !!(el.compareDocumentPosition(summary) & Node.DOCUMENT_POSITION_FOLLOWING);
    }, 'Pontos e conquistas nesta loja')).toBe(true);
    await page.getByRole('button', { name: 'Meus registros', exact: true }).click();
    await expect(support).toContainText('9.007.199.254.740.993');
    await page.getByRole('button', { name: 'A fazer', exact: true }).click();
    await expect(activity).toBeInViewport();
    await noOverflow(page);
    await page.locator('img').evaluateAll(images => Promise.all(images.map(image => (image as HTMLImageElement).decode())));
    await page.screenshot({ path: `.artifacts/desktop-atividades-${testInfo.project.name}.png`, fullPage: true });
  });

  test('texto ampliado no desktop preserva uma lista legível para participante', async ({ page }) => {
    await mockActivities(page);
    await page.goto(rootPath);
    const catalog = page.locator('section[aria-labelledby="catalog-title"]');
    await expect(catalog).toBeVisible();
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    for (const width of [1120, 1280, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect((await catalog.boundingBox())!.width).toBeGreaterThanOrEqual(280);
      await noOverflow(page);
    }
  });

  test('janela baixa e nome sem espaços preservam os acessos com texto ampliado', async ({ page }) => {
    const { state } = await mockRelationship(page, { merchant: true });
    state.store.name = 'Carinho'.repeat(11);
    await page.setViewportSize({ width: 1280, height: 600 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(home);
    await expect(page.getByRole('heading', { name: state.store.name, exact: true })).toBeVisible();
    const settings = page.getByRole('link', { name: 'Configurações', exact: true });
    await settings.focus(); await expect(settings).toBeInViewport();
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    await page.getByRole('heading', { name: state.store.name, exact: true }).focus();
    await settings.focus(); await expect(settings).toBeInViewport();
    await noOverflow(page);
  });
});

test('no celular a lista vem antes do apoio e não corta ações nem saldo negativo', async ({ page }) => {
  await mockActivities(page, { handler: async (route, url) => {
    if (!url.pathname.endsWith('/pontos')) return false;
    await json(route, { storeId: ids.first, participantMembershipId: '55555555-5555-4555-8555-555555555555', available: '-10', pending: '7',
      today: { localDate: '2026-10-22', timezone: 'America/Sao_Paulo', submitted: 2, approved: 1, credited: '15', adjusted: '0' } });
    return true;
  } });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(rootPath);
  const activity = page.getByRole('link', { name: /Ver atividade\s*:\s*Ler algumas páginas/ });
  await expect(activity).toBeVisible();
  const balance = page.getByRole('region', { name: 'Seu potinho de pontos', exact: true });
  await expect(balance).toContainText('-10');
  expect((await activity.boundingBox())!.y).toBeLessThan((await balance.boundingBox())!.y);
  await activity.focus(); await expect(activity).toBeInViewport();
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  await noOverflow(page);
});
