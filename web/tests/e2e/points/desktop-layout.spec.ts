import { expect } from '@playwright/test';
import { actionsFit, entry, mockReview, noOverflow, statementPath, test } from './helpers';

test.describe('Extrato no desktop', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  for (const merchant of [false, true]) {
    test(`movimentos e origem aparecem na primeira tela: ${merchant ? 'lojista' : 'participante'}`, async ({ page }, info) => {
      await mockReview(page, { merchant, status: 'APPROVED' });
      await page.goto(statementPath);
      const origin = page.getByRole('link', { name: /Abrir origem do movimento/ });
      await expect(origin).toBeVisible();
      await page.locator('img').evaluateAll(images => Promise.all(images.map(image => (image as HTMLImageElement).decode())));
      await page.screenshot({ path: `.artifacts/desktop-extrato-${merchant ? 'lojista' : 'participante'}-${info.project.name}.png`, fullPage: true });
      await page.screenshot({ path: `.artifacts/desktop-extrato-${merchant ? 'lojista' : 'participante'}-${info.project.name}-viewport.png` });
      await expect(origin).toBeInViewport({ ratio: 1 });
      if (!merchant) {
        expect(await origin.evaluate(element => !!(element.compareDocumentPosition(document.querySelector('[aria-label="Seu potinho de pontos"]')!) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
      }
      for (const label of ['Movimentos desde a data', 'Movimentos até a data']) {
        expect((await page.getByLabel(label, { exact: true }).boundingBox())!.width).toBeGreaterThanOrEqual(180);
      }
      if (merchant) expect((await page.getByRole('combobox', { name: 'Pessoa do extrato', exact: true }).boundingBox())!.width).toBeGreaterThanOrEqual(180);
      await noOverflow(page);
    });
  }

  test('erro do período aponta a data final e mantém o filtro aplicado', async ({ page }) => {
    await mockReview(page, { merchant: false });
    await page.goto(`${statementPath}?kind=ACTIVITY_REVERSAL`);
    await page.getByLabel('Movimentos desde a data', { exact: true }).fill('2026-10-23');
    const end = page.getByLabel('Movimentos até a data', { exact: true }); await end.fill('2026-10-01');
    await page.getByRole('button', { name: 'Filtrar extrato', exact: true }).click();
    await expect(end).toBeFocused();
    await expect(end).toHaveAccessibleDescription('A data final precisa ser igual ou posterior à inicial.');
    await expect(page).toHaveURL(`${statementPath}?kind=ACTIVITY_REVERSAL`);
  });

  test('saldo negativo extenso e ajustes continuam legíveis com texto ampliado', async ({ page }) => {
    const { state } = await mockReview(page, { merchant: false, balance: '-9007199254740993' });
    state.entries = [entry('ACTIVITY_REVERSAL', '-9007199254740993', { compensatesEntryId: 'original' })];
    await page.goto(statementPath); await expect(page.getByRole('link', { name: /Abrir origem/ })).toBeVisible();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    for (const width of [1120, 1280, 1440]) {
      await page.setViewportSize({ width, height: 900 }); await noOverflow(page); await actionsFit(page);
      await expect(page.getByRole('heading', { name: '-9.007.199.254.740.993 pontos · Leitura da ocasião', exact: true })).toBeVisible();
    }
  });

  test('o período filtra movimentos sem transformar o saldo atual em total da página', async ({ page }) => {
    const { state } = await mockReview(page, { merchant: false, status: 'APPROVED', balance: '37' });
    state.entries = [entry('ACTIVITY_CREDIT', '15'), entry('REDEMPTION_REFUND', '10', { id: 'refund', compensatesEntryId: 'debit' })];
    await page.goto(statementPath);
    await expect(page.getByText('Esta devolução compensa o débito original deste resgate.', { exact: true })).toBeVisible();
    await page.getByRole('combobox', { name: 'Tipo de movimento', exact: true }).selectOption('REDEMPTION_REFUND');
    await page.getByRole('button', { name: 'Filtrar extrato', exact: true }).click();
    await expect(page.getByRole('link', { name: /Abrir origem/ })).toHaveCount(1);
    await expect(page.getByRole('region', { name: 'Seu potinho de pontos', exact: true })).toContainText('37');
    await expect(page.getByText('Saldo atual, independente do período filtrado.', { exact: true })).toBeVisible();
  });
});

for (const merchant of [false, true]) {
  test(`extrato em celular mantém controles e foco do erro: ${merchant ? 'lojista' : 'participante'}`, async ({ page }) => {
    const { state } = await mockReview(page, { merchant, status: 'APPROVED' });
    state.entries[0].origin!.name = 'Carinho'.repeat(11);
    await page.emulateMedia({ reducedMotion: 'reduce' }); await page.goto(statementPath);
    await page.getByLabel('Movimentos desde a data', { exact: true }).fill('2026-10-23');
    const end = page.getByLabel('Movimentos até a data', { exact: true }); await end.fill('2026-10-01');
    await page.getByRole('button', { name: 'Filtrar extrato', exact: true }).click();
    await expect(end).toBeFocused(); await expect(end).toHaveAccessibleDescription('A data final precisa ser igual ou posterior à inicial.');
    await noOverflow(page); await actionsFit(page);
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    await noOverflow(page); await actionsFit(page);
  });
}
