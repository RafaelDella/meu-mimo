import { expect } from '@playwright/test';
import { actionsFit, feedItem, home, json, mockRelationship, noOverflow, test } from './helpers';
import { pixel } from '../albums/helpers';

test.describe('Mural no desktop', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  for (const merchant of [false, true]) {
    test(`filtros e primeiro item ficam próximos: ${merchant ? 'lojista' : 'participante'}`, async ({ page }, info) => {
      await mockRelationship(page, { merchant }); await page.goto(`${home}/mural`);
      const open = page.getByRole('link', { name: 'Abrir conquista', exact: true });
      await expect(open).toBeVisible();
      await page.screenshot({ path: `.artifacts/desktop-mural-${merchant ? 'lojista' : 'participante'}-${info.project.name}.png`, fullPage: true });
      await page.screenshot({ path: `.artifacts/desktop-mural-${merchant ? 'lojista' : 'participante'}-${info.project.name}-viewport.png` });
      await expect(open).toBeInViewport({ ratio: 1 });
      for (const label of ['De', 'Até']) {
        expect((await page.getByLabel(label, { exact: true }).boundingBox())!.width).toBeGreaterThanOrEqual(180);
      }
      if (merchant) expect((await page.getByRole('combobox', { name: 'Pessoa', exact: true }).boundingBox())!.width).toBeGreaterThanOrEqual(180);
      await noOverflow(page);
    });
  }

  test('erro do período é associado ao campo final', async ({ page }) => {
    await mockRelationship(page); await page.goto(`${home}/mural`);
    await page.getByLabel('De', { exact: true }).fill('2026-10-23');
    const end = page.getByLabel('Até', { exact: true }); await end.fill('2026-10-01');
    await page.getByRole('button', { name: 'Aplicar período', exact: true }).click();
    await expect(end).toBeFocused();
    await expect(end).toHaveAccessibleDescription('A data final precisa ser igual ou posterior à inicial.');
  });

  test('conversa por teclado conserva as reações e cabe com texto 200%', async ({ page }) => {
    await mockRelationship(page, { merchant: true }); await page.goto(`${home}/mural`);
    const trigger = page.getByRole('button', { name: 'Abrir conversa deste item', exact: true });
    await trigger.focus(); await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'Conversa deste item', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Reações deste item', exact: true })).toHaveCount(1);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    for (const width of [1120, 1280, 1440]) {
      await page.setViewportSize({ width, height: 900 }); await noOverflow(page); await actionsFit(page);
    }
  });

  test('resumo extenso e mídia publicada não empurram o acesso ao ticket', async ({ page }) => {
    await mockRelationship(page, { handler: async (route, url, state) => {
      if (url.pathname.endsWith('/midia/arquivos/desktop-preview/acesso')) {
        await json(route, { url: '/api/album-content/desktop-preview', expiresAt: new Date(Date.now() + 300_000).toISOString() }); return true;
      }
      if (url.pathname === '/api/album-content/desktop-preview') {
        await route.fulfill({ status: 200, contentType: 'image/png', body: pixel }); return true;
      }
      if (!url.pathname.endsWith('/mural')) return false;
      const item = feedItem(state);
      await json(route, { items: [{ ...item, subjectType: 'TICKET', path: `${home}/tickets/${item.subjectId}`, status: 'CANCELLATION_REQUESTED', name: 'Um café com carinho', summary: 'Um momento para guardar. '.repeat(40), publishedMediaCount: 3, preview: { assetId: 'desktop-preview', mediaType: 'PHOTO' } }], page: 1, pageSize: 20, total: 1 }); return true;
    } });
    await page.goto(`${home}/mural`);
    await expect(page.getByRole('article').getByText('Cancelamento solicitado', { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Abrir ticket', exact: true })).toBeInViewport({ ratio: 1 });
    await page.getByText('3 momentos publicados.', { exact: true }).scrollIntoViewIfNeeded();
    const preview = page.getByRole('img', { name: 'Prévia privada do álbum', exact: true });
    await expect(preview).toBeVisible(); await preview.evaluate((image: HTMLImageElement) => image.decode());
    await page.evaluate(() => { window.scrollTo(0, 0); });
    await expect(page.getByRole('link', { name: 'Abrir ticket', exact: true })).toBeInViewport({ ratio: 1 });
    await noOverflow(page);
  });
});

test('mural em celular mantém período acessível e conversa sem rolagem horizontal', async ({ page }) => {
  await mockRelationship(page, { merchant: true }); await page.emulateMedia({ reducedMotion: 'reduce' }); await page.goto(`${home}/mural`);
  await page.getByLabel('De', { exact: true }).fill('2026-10-23');
  const end = page.getByLabel('Até', { exact: true }); await end.fill('2026-10-01');
  await page.getByRole('button', { name: 'Aplicar período', exact: true }).click();
  await expect(end).toBeFocused(); await expect(end).toHaveAccessibleDescription('A data final precisa ser igual ou posterior à inicial.');
  await page.getByRole('button', { name: 'Abrir conversa deste item', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Conversa deste item', exact: true })).toBeVisible();
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  await noOverflow(page); await actionsFit(page);
});
