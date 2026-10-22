import { expect } from '@playwright/test';
import { actionsFit, catalogPath, detailPath, mockRewards, noOverflow, reward, test } from './helpers';
import { ids, json } from '../stores/helpers';

test('lojista cria mimo com prévia sem persistir e quantidade disponível agora', async ({ page }) => {
  const { state } = await mockRewards(page, { merchant: true }); await page.goto(`${catalogPath}/novo`);
  await page.getByLabel('Nome do mimo', { exact: true }).fill('Café de domingo');
  await page.getByLabel('Descrição', { exact: true }).fill('Um café para começar o domingo.');
  await page.getByLabel('Estoque ilimitado', { exact: true }).uncheck();
  await page.getByLabel('Quantidade disponível agora', { exact: true }).fill('3');
  await page.getByRole('button', { name: 'Ver prévia', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Prévia do mimo', exact: true })).toBeVisible(); expect(state.bodies).toHaveLength(0);
  await page.getByRole('button', { name: 'Salvar mimo', exact: true }).click();
  await expect(page).toHaveURL(detailPath); expect(state.bodies[0].stock).toBe(3);
  await expect(page.getByRole('heading', { name: 'Café de domingo', exact: true })).toBeVisible();
});

test('edição confirma configuração e revisão de estoque e permite arquivar', async ({ page }) => {
  const { state } = await mockRewards(page, { merchant: true }); state.current.stock = 4; state.current.stockRevision = 7;
  await page.goto(`${detailPath}/editar`); await page.getByLabel('Nome do mimo', { exact: true }).fill('Café atualizado');
  await page.getByRole('button', { name: 'Salvar mimo', exact: true }).click(); await expect(page).toHaveURL(detailPath);
  expect(state.bodies[0].expectedVersion).toBe(1); expect(state.bodies[0].expectedStockRevision).toBe(7);
  await page.getByRole('button', { name: 'Arquivar mimo', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar arquivamento', exact: true }).click();
  await expect(page.getByText('Este mimo foi arquivado.', { exact: false })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Editar mimo', exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Café atualizado', exact: true })).toBeFocused();
});

test('estoque conflitante preserva campos e exige revisão explícita', async ({ page }) => {
  let failed = false;
  const { state } = await mockRewards(page, { merchant: true, handler: async (route, url, current) => {
    if (route.request().method() !== 'PATCH' || failed) return false;
    failed = true; current.current.stock = 1; current.current.stockRevision = 8;
    await json(route, { code: 'stock_changed', message: 'O estoque mudou.' }, 409); return true;
  } }); state.current.stock = 2; state.current.stockRevision = 7;
  await page.goto(`${detailPath}/editar`); await page.getByLabel('Nome do mimo', { exact: true }).fill('Rascunho preservado');
  await page.getByRole('button', { name: 'Salvar mimo', exact: true }).click();
  await expect(page.getByLabel('Nome do mimo', { exact: true })).toHaveValue('Rascunho preservado');
  await expect(page.getByRole('button', { name: 'Salvar mimo', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Carregar versão atual', exact: true }).click();
  await expect(page.getByLabel('Quantidade disponível agora', { exact: true })).toHaveValue('1');
  await page.getByRole('button', { name: 'Salvar mimo', exact: true }).click(); await expect(page).toHaveURL(detailPath);
  expect(state.bodies[0].expectedStockRevision).toBe(8);
});

test('catálogo mantém busca categoria arquivo e páginas na URL', async ({ page }) => {
  const { state } = await mockRewards(page, { merchant: true }); state.rewards = Array.from({ length: 21 }, (_, index) => reward({ id: `reward-${index}`, name: `Café ${index + 1}`, archivedAt: '2026-10-22T15:00:00Z' }));
  await page.goto(catalogPath); await page.getByLabel('Buscar mimo', { exact: true }).fill('Café');
  await page.getByRole('combobox', { name: 'Categoria do mimo', exact: true }).selectOption('A dois');
  await page.getByRole('combobox', { name: 'Mostrar mimos', exact: true }).selectOption('ARCHIVED');
  await page.getByRole('button', { name: 'Filtrar mimos', exact: true }).click();
  await expect(page).toHaveURL(/q=Caf.*category=A\+dois.*state=ARCHIVED.*page=1/);
  await page.getByRole('button', { name: 'Próximos', exact: true }).click(); await expect(page.getByText('Página 2 de 2', { exact: true })).toBeVisible();
  await page.goBack(); await expect(page.getByText('Página 1 de 2', { exact: true })).toBeVisible();
});

test('catálogo preserva página de 50 itens ao filtrar e mostra o item51 na segunda página', async ({ page }) => {
  const { state } = await mockRewards(page, { merchant: true });
  state.rewards = Array.from({ length: 51 }, (_, index) => reward({ id: `reward-${index}`, name: `Café ${index + 1}` }));
  await page.goto(`${catalogPath}?pageSize=50&page=1`); await page.getByLabel('Buscar mimo', { exact: true }).fill('Café');
  await page.getByRole('button', { name: 'Filtrar mimos', exact: true }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get('pageSize')).toBe('50');
  await page.getByRole('button', { name: 'Próximos', exact: true }).click();
  await expect(page.getByText('Página 2 de 2', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Café 51', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Café 21', exact: true })).toHaveCount(0);
  expect(new URL(page.url()).searchParams.get('pageSize')).toBe('50');
});

test('busca aceita 80 caracteres Unicode completos sem cortar emojis', async ({ page }) => {
  const value = '🎁'.repeat(80); const { state } = await mockRewards(page);
  state.rewards = [reward({ name: value })]; await page.goto(catalogPath);
  await page.getByLabel('Buscar mimo', { exact: true }).fill(value); await expect(page.getByLabel('Buscar mimo', { exact: true })).toHaveValue(value);
  await page.getByRole('button', { name: 'Filtrar mimos', exact: true }).click();
  await expect.poll(() => state.queries[state.queries.length - 1]?.get('q')).toBe(value);
  await expect(page.getByRole('heading', { name: value, exact: true })).toBeVisible();
});

test('potinho real e vitrine aparecem na Lojinha sem saldo de demonstração', async ({ page }) => {
  await mockRewards(page, { balance: '9007199254740993' }); await page.goto(`/lojas/${ids.first}`);
  await expect(page.locator('.ui-points').getByText('9.007.199.254.740.993', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Mimos na sua vitrine', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Ver todos os mimos', exact: true }).click(); await expect(page).toHaveURL(catalogPath);
});

test('saldo negativo informa falta exata e liga às atividades', async ({ page }) => {
  await mockRewards(page, { balance: '-9007199254740993' }); await page.goto(detailPath);
  await expect(page.getByText('Faltam 9.007.199.254.741.003 pontos para este mimo.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Resgatar mimo', exact: true })).toBeDisabled();
  await expect(page.getByRole('link', { name: 'Ver atividades para juntar pontos', exact: true })).toHaveAttribute('href', `/lojas/${ids.first}/atividades`);
});

test('formulário e prévia cabem com texto 200% e movimento reduzido', async ({ page }) => {
  await mockRewards(page, { merchant: true }); await page.emulateMedia({ reducedMotion: 'reduce' }); await page.goto(`${detailPath}/editar`);
  await page.getByRole('button', { name: 'Ver prévia', exact: true }).click(); await noOverflow(page); await actionsFit(page);
  await page.screenshot({ path: `.artifacts/t09-editor-${page.viewportSize()!.width}.png`, fullPage: true });
  await page.addStyleTag({ content: 'html { font-size: 200%; }' }); await noOverflow(page); await actionsFit(page);
  await page.screenshot({ path: `.artifacts/t09-editor-200-${page.viewportSize()!.width}.png`, fullPage: true });
});
