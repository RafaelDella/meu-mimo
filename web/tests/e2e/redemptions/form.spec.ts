import { expect } from '@playwright/test';
import { detailPath, mockRewards, test } from './helpers';

test('edição envia apenas configuração e controle de concorrência para a API estrita', async ({ page }) => {
  const allowed = ['name', 'description', 'category', 'sticker', 'cost', 'note', 'instructions', 'available', 'stock',
    'operationId', 'expectedVersion', 'expectedStockRevision'].sort();
  const { state } = await mockRewards(page, { merchant: true, handler: async (route, url, current) => {
    if (route.request().method() !== 'PATCH' || !url.pathname.endsWith(detailPath)) return false;
    const body = route.request().postDataJSON() as Record<string, unknown>;
    if (Object.keys(body).some(key => !allowed.includes(key))) {
      current.bodies.push(body);
      await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ code: 'field_invalid', message: 'Campo não permitido.' }) });
      return true;
    }
    return false;
  } });
  await page.goto(`${detailPath}/editar`);
  await page.getByLabel('Nome do mimo', { exact: true }).fill('Café atualizado');
  await page.getByRole('button', { name: 'Salvar mimo', exact: true }).click();
  await expect(page).toHaveURL(detailPath);
  expect(state.bodies).toHaveLength(1); expect(Object.keys(state.bodies[0]).sort()).toEqual(allowed);
});

test('edição com nome válido foca categoria longa e depois custo zero, com erros associados', async ({ page }) => {
  const { state } = await mockRewards(page, { merchant: true }); await page.goto(`${detailPath}/editar`);
  const name = page.getByLabel('Nome do mimo', { exact: true }); const category = page.getByLabel('Categoria', { exact: true });
  const cost = page.getByLabel('Custo em pontos', { exact: true }); const save = page.getByRole('button', { name: 'Salvar mimo', exact: true });
  await expect(name).toHaveValue('Café da ocasião'); await category.fill('c'.repeat(81)); await cost.fill('0'); await save.click();
  await expect(category).toBeFocused(); await expect(category).toHaveAttribute('aria-invalid', 'true');
  await expect(category).toHaveAccessibleDescription(/Use até 80 caracteres Unicode na categoria\./);
  await expect(cost).toHaveAttribute('aria-invalid', 'true'); await expect(cost).toHaveAccessibleDescription(/Use um número inteiro de 1 a 1\.000\.000 pontos\./);
  await expect(name).not.toHaveAttribute('aria-invalid', 'true'); expect(state.bodies).toHaveLength(0);
  await category.fill('A dois'); await save.click(); await expect(cost).toBeFocused();
  await expect(category).not.toHaveAttribute('aria-invalid', 'true'); await expect(cost).toHaveAccessibleDescription(/Use um número inteiro de 1 a 1\.000\.000 pontos\./);
  expect(state.bodies).toHaveLength(0);
});

test('erros de todos os campos recebem foco na ordem do formulário e desaparecem após correção', async ({ page }) => {
  const { state } = await mockRewards(page, { merchant: true }); await page.goto(`${detailPath}/editar`);
  const cases = [
    { role: 'textbox', label: 'Nome do mimo', invalid: '', valid: 'Nome válido', error: /Escreva um nome para o mimo\./ },
    { role: 'textbox', label: 'Descrição', invalid: 'd'.repeat(1001), valid: 'Descrição válida', error: /Use até 1\.000 caracteres Unicode na descrição\./ },
    { role: 'combobox', label: 'Categoria', invalid: 'c'.repeat(81), valid: 'A dois', error: /Use até 80 caracteres Unicode na categoria\./ },
    { role: 'spinbutton', label: 'Custo em pontos', invalid: '0', valid: '10', error: /Use um número inteiro de 1 a 1\.000\.000 pontos\./ },
    { role: 'textbox', label: 'Recadinho do catálogo', invalid: 'r'.repeat(501), valid: 'Recadinho válido', error: /Use até 500 caracteres Unicode no recadinho\./ },
    { role: 'textbox', label: 'Instruções para combinar', invalid: 'i'.repeat(1001), valid: 'Combine pela conversa', error: /Use até 1\.000 caracteres Unicode nas instruções\./ },
    { role: 'spinbutton', label: 'Quantidade disponível agora', invalid: '-1', valid: '1', error: /Use um número inteiro de 0 a 1\.000\.000 unidades\./ },
  ] as const;
  await page.getByLabel('Estoque ilimitado', { exact: true }).uncheck();
  for (const current of cases) await page.getByRole(current.role, { name: current.label, exact: true }).fill(current.invalid);
  for (const current of cases) {
    await page.getByRole('button', { name: 'Salvar mimo', exact: true }).click();
    const field = page.getByRole(current.role, { name: current.label, exact: true });
    await expect(field).toBeFocused(); await expect(field).toHaveAttribute('aria-invalid', 'true'); await expect(field).toHaveAccessibleDescription(current.error);
    expect(state.bodies).toHaveLength(0); await field.fill(current.valid); await expect(field).not.toHaveAttribute('aria-invalid', 'true');
  }
  await page.getByRole('button', { name: 'Salvar mimo', exact: true }).click(); await expect(page).toHaveURL(detailPath); expect(state.bodies).toHaveLength(1);
});

test('limites de texto contam caracteres Unicode completos no formulário', async ({ page }) => {
  const { state } = await mockRewards(page, { merchant: true }); await page.goto(`${detailPath}/editar`);
  const fields = [{ label: 'Nome do mimo', count: 80 }, { label: 'Descrição', count: 1000 }, { label: 'Categoria', count: 80 },
    { label: 'Recadinho do catálogo', count: 500 }, { label: 'Instruções para combinar', count: 1000 }];
  for (const field of fields) await page.getByRole(field.label === 'Categoria' ? 'combobox' : 'textbox', { name: field.label, exact: true }).fill('🎁'.repeat(field.count));
  await page.getByRole('button', { name: 'Salvar mimo', exact: true }).click(); await expect(page).toHaveURL(detailPath);
  expect(state.bodies).toHaveLength(1); expect(Array.from(String(state.bodies[0].name))).toHaveLength(80);
  expect(Array.from(String(state.bodies[0].description))).toHaveLength(1000); expect(Array.from(String(state.bodies[0].note))).toHaveLength(500);
});
