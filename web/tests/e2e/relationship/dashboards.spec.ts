import { expect } from '@playwright/test';
import { test, mockRelationship, home, ids, refresh, json, noOverflow } from './helpers';

test('P01 usa saudação lojista saldo e exatamente três acessos principais', async ({ page }) => {
  await mockRelationship(page); await page.goto(home);
  await expect(page.getByRole('heading', { name: 'Que bom ter você aqui, Ana participante', exact: true })).toBeVisible();
  await expect(page.getByText('Uma lojinha preparada por Rafa.', { exact: true })).toBeVisible();
  const nav = page.getByRole('navigation', { name: 'Sua participação', exact: true }); await expect(nav.getByRole('link')).toHaveCount(3);
  await expect(nav).toContainText('Lojinha'); await expect(nav).toContainText('Atividades'); await expect(nav).toContainText('Meus mimos');
  await expect(page.getByRole('region', { name: 'Seu potinho de pontos', exact: true })).toContainText('15');
  await expect(page.getByRole('region', { name: 'Seu potinho de pontos', exact: true })).toContainText('7');
  await expect(page.getByRole('link', { name: 'Coração: abrir bilhete', exact: true })).toBeVisible();
});

test('L02 usa quatro acessos principais e dados reais com auxiliares separados', async ({ page }) => {
  await mockRelationship(page, { merchant: true }); await page.goto(home);
  await expect(page.getByRole('heading', { name: 'Resumo da sua loja', exact: true })).toBeVisible();
  const nav = page.getByRole('navigation', { name: 'Gestão da loja', exact: true }); await expect(nav.getByRole('link')).toHaveCount(4);
  await expect(nav).toContainText('Resumo'); await expect(nav).toContainText('Atividades'); await expect(nav).toContainText('Mimos'); await expect(nav).toContainText('Pessoas');
  const aux = page.getByRole('navigation', { name: 'Outros acessos da loja', exact: true }); await expect(aux).toContainText('Extrato'); await expect(aux).toContainText('Convites'); await expect(aux).toContainText('Configurações');
  await expect(page.getByText('Participantes ativos', { exact: true }).locator('..')).toContainText('4');
  await expect(page.getByText('Registros em análise', { exact: true }).locator('..')).toContainText('2');
});

test('saldo negativo continua negativo e foco permanece no controle após atualização', async ({ page }) => {
  const { state } = await mockRelationship(page); await page.goto(home);
  const link = page.getByRole('link', { name: 'Ver todas as atividades', exact: true }); await link.focus(); state.balance = '-10'; await refresh(page);
  await expect(page.getByRole('region', { name: 'Seu potinho de pontos', exact: true })).toContainText('-10');
  await expect(page.getByText('Seu saldo está negativo por ajustes registrados. Os tickets já emitidos continuam válidos.', { exact: true })).toBeVisible(); await expect(link).toBeFocused();
});

test('falha do painel financeiro não aparece como zero e retoma ao voltar online', async ({ page }) => {
  let failed = true; await mockRelationship(page, { handler: async (route, url) => {
    if (!url.pathname.endsWith('/lojinha') || !failed) return false; await json(route, { code: 'temporarily_unavailable', message: 'Resumo temporariamente indisponível.' }, 503); return true;
  } });
  await page.goto(home); await expect(page.getByRole('alert').filter({ hasText: 'Resumo temporariamente indisponível.' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Seu potinho de pontos', exact: true })).toHaveCount(0); failed = false;
  await page.evaluate(() => window.dispatchEvent(new Event('online'))); await expect(page.getByRole('region', { name: 'Seu potinho de pontos', exact: true })).toContainText('15');
});

test('retomar online reconsulta contexto e mostra pausa feita em outro dispositivo', async ({ page }) => {
  const { state } = await mockRelationship(page); await page.goto(`${home}/mural`);
  const control = page.getByRole('button', { name: 'Reagir com coração', exact: true }); await control.focus(); state.store.state = 'PAUSED';
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(page.getByText('Esta loja está pausada. Novos convites, conquistas e resgates estão suspensos. O histórico continua acessível.', { exact: true })).toBeVisible();
  await expect(control).toBeFocused();
});

test('trocar conta descarta dados e respostas antigas de bilhete', async ({ page }) => {
  const { auth } = await mockRelationship(page); await page.goto(home);
  await page.getByRole('button', { name: '♡ Abrir bilhete', exact: true }).click(); await expect(page.getByRole('dialog')).toContainText('Carinho privado versão 1');
  auth.loggedIn = false; await page.evaluate(() => window.dispatchEvent(new Event('meumimo:session-changed')));
  await expect(page.getByRole('heading', { name: 'Acesse sua conta', exact: true })).toBeVisible();
  await expect(page.getByText('Carinho privado versão 1', { exact: true })).not.toBeVisible();
  expect(auth.userId).toBe(ids.ana);
});

test('painel comporta texto 200% e exibe navegação lateral no desktop', async ({ page }, testInfo) => {
  await mockRelationship(page, { merchant: true }); await page.goto(home); await expect(page.getByRole('heading', { name: 'Resumo da sua loja', exact: true })).toBeVisible();
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; }); await noOverflow(page);
  await page.screenshot({ path: `.artifacts/t12-painel-${testInfo.project.name}.png`, fullPage: true });
  await page.evaluate(() => { document.documentElement.style.fontSize = ''; }); await page.setViewportSize({ width: 1280, height: 900 });
  const nav = await page.getByRole('navigation', { name: 'Gestão da loja', exact: true }).boundingBox();
  const heading = await page.getByRole('heading', { name: 'Resumo da sua loja', exact: true }).boundingBox(); expect(nav!.x + nav!.width).toBeLessThanOrEqual(heading!.x);
});
