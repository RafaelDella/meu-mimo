import { expect } from '@playwright/test';
import { test, mockRelationship, home, ids, json, refresh, groupId, noOverflow, actionsFit } from './helpers';

test('central lista contexto e filtra categorias sem sumir avisos silenciados', async ({ page }) => {
  const { state } = await mockRelationship(page); state.groups[0].attentionActive = false; state.groups[0].count = 3;
  await page.goto('/notificacoes'); await expect(page.getByRole('heading', { name: 'Novidades', exact: true })).toBeVisible();
  await expect(page.getByText('3 interações neste grupo.', { exact: true })).toBeVisible();
  await expect(page.getByText(/Sem aviso ativo no contador/)).toBeVisible();
  await page.getByRole('combobox', { name: 'Categoria', exact: true }).selectOption('NOTES'); await expect(page.getByText('Nenhuma novidade neste filtro.', { exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: 'Categoria', exact: true }).selectOption('SOCIAL'); await expect(page.getByText('3 interações neste grupo.', { exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: 'Loja', exact: true }).selectOption(ids.first); expect(state.calls.some(call => call.includes('storeId=') && call.includes('category=SOCIAL'))).toBe(true);
});

test('leitura envia a versão observada e deixa entrega posterior não lida', async ({ page }) => {
  const { state } = await mockRelationship(page); await page.goto('/notificacoes');
  await expect(page.getByText('1 novidade não lida', { exact: true })).toBeVisible();
  state.groups[0].version = 2; state.groups[0].count = 2; state.groups[0].unreadCount = 2;
  await page.getByRole('button', { name: 'Marcar grupo como lido', exact: true }).click();
  await expect.poll(() => state.readBodies.length).toBe(1); expect(state.readBodies[0]).toEqual({ throughVersion: 1 });
  await expect(page.getByText('1 novidade não lida', { exact: true })).toBeVisible();
  expect(state.read.size).toBe(0);
});

test('destino autorizado apresenta loja e papel antes da troca de contexto', async ({ page }) => {
  const { state } = await mockRelationship(page); await page.goto('/notificacoes');
  await page.getByRole('button', { name: 'Abrir novidade', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Loja da Ana'); await expect(page.getByRole('dialog')).toContainText('participante');
  expect(new URL(page.url()).pathname).toBe('/notificacoes'); expect(state.read.size).toBe(0);
  await page.getByRole('button', { name: 'Abrir nesta loja', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${home}\\?bilhete=`)); await expect(page.getByRole('dialog')).toContainText('Carinho privado versão 1');
});

test('destino revogado retira prévia e consulta novamente a central', async ({ page }) => {
  const { state } = await mockRelationship(page, { handler: async (route, url, current) => {
    if (!url.pathname.endsWith(`/${groupId}/destino`)) return false;
    current.groups = []; await json(route, { code: 'resource_not_found', message: 'Esta novidade não está disponível.' }, 404); return true;
  } });
  await page.goto('/notificacoes'); await page.getByRole('button', { name: 'Abrir novidade', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible(); await expect(page.getByText('Nenhuma novidade neste filtro.', { exact: true })).toBeVisible();
  await expect(page.getByRole('alert').filter({ hasText: 'Esta novidade não está disponível.' })).toBeVisible();
  expect(state.calls.filter(call => call.startsWith('GET /api/notificacoes/grupos?')).length).toBeGreaterThan(1);
});

test('503 na central é erro e recuperação não inventa contador zero', async ({ page }) => {
  let failed = true; await mockRelationship(page, { handler: async (route, url) => {
    if (url.pathname !== '/api/notificacoes/grupos' || !failed) return false;
    await json(route, { code: 'temporarily_unavailable', message: 'Central temporariamente indisponível.' }, 503); return true;
  } });
  await page.goto('/notificacoes'); await expect(page.getByRole('alert').filter({ hasText: 'Central temporariamente indisponível.' })).toBeVisible();
  await expect(page.getByText('0 grupos pedem sua atenção.', { exact: true })).not.toBeVisible(); failed = false;
  await page.getByRole('button', { name: 'Consultar novidades novamente', exact: true }).click(); await expect(page.getByText('1 grupo pede sua atenção.', { exact: true })).toBeVisible();
});

test('novidades respeita 200%, Escape e retorno de foco sem roubo pelo refresh', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); await mockRelationship(page); await page.goto('/notificacoes');
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  const button = page.getByRole('button', { name: 'Abrir novidade', exact: true }); await button.click(); await expect(page.getByRole('dialog')).toBeVisible();
  await page.screenshot({ path: `.artifacts/t12-novidades-${testInfo.project.name}.png`, fullPage: true });
  await page.keyboard.press('Tab'); await page.keyboard.press('Escape'); await expect(button).toBeFocused();
  await refresh(page); await expect(button).toBeFocused(); await noOverflow(page); await actionsFit(page);
});
