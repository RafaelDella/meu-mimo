import { expect } from '@playwright/test';
import type { AdminActionBody } from '../../../src/contracts/admin';
import { test, mockAdmin, accountPath, storePath, applyAdminAction, json } from './helpers';

test('bloqueio confirma alcance e motivo500Unicode antes de aplicar', async ({ page }) => {
  const { state } = await mockAdmin(page); await page.goto(accountPath); await page.getByRole('button', { name: 'Bloquear acesso por segurança', exact: true }).click();
  const dialog = page.getByRole('dialog'); await expect(dialog).toContainText('Pessoa de metadados'); await expect(dialog).toContainText('leitura');
  const reason = '🌷'.repeat(500); await dialog.getByLabel('Motivo administrativo', { exact: true }).fill(reason); expect(state.bodies).toHaveLength(0);
  await dialog.getByRole('button', { name: 'Confirmar ação administrativa', exact: true }).click(); await expect(dialog).not.toBeVisible();
  expect(state.bodies).toHaveLength(1); expect(state.bodies[0]).toMatchObject({ reason, expectedVersion: 0, action: 'BLOCK_ACCOUNT' });
  await expect(page.getByRole('button', { name: 'Reativar acesso', exact: true })).toBeVisible();
  expect(page.url()).not.toContain(encodeURIComponent(reason));
});
test('motivo vazio ou501Unicode não envia e foca erro', async ({ page }) => {
  const { state } = await mockAdmin(page); await page.goto(accountPath); await page.getByRole('button', { name: 'Bloquear acesso por segurança', exact: true }).click();
  const field = page.getByLabel('Motivo administrativo', { exact: true }); const button = page.getByRole('button', { name: 'Confirmar ação administrativa', exact: true });
  await field.fill('  '); await button.click(); await expect(field).toBeFocused();
  await field.fill('🌷'.repeat(501)); await button.click(); await expect(field).toHaveAttribute('aria-invalid', 'true'); expect(state.bodies).toHaveLength(0);
});
test('pausa da plataforma e retirada preservam pausa independente do lojista', async ({ page }) => {
  const { state } = await mockAdmin(page); state.stores[0].state = 'PAUSED'; await page.goto(storePath);
  await page.getByRole('button', { name: 'Pausar novas ações da loja', exact: true }).click(); await expect(page.getByRole('dialog')).toContainText('lojista');
  await page.getByLabel('Motivo administrativo', { exact: true }).fill('Conferência operacional'); await page.getByRole('button', { name: 'Confirmar ação administrativa', exact: true }).click();
  await page.getByRole('button', { name: 'Retirar pausa da plataforma', exact: true }).click(); await page.getByLabel('Motivo administrativo', { exact: true }).fill('Conferência concluída'); await page.getByRole('button', { name: 'Confirmar ação administrativa', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pausar novas ações da loja', exact: true })).toBeVisible(); expect(state.stores[0].state).toBe('PAUSED'); expect(state.stores[0].platformPausedAt).toBe(null);
});
test('resposta perdida consulta UUID antes de qualquer nova intenção', async ({ page }) => {
  let lost = true; const { state } = await mockAdmin(page, { handler: async (route, url, current) => {
    if (url.pathname !== '/api/admin/acoes' || !lost) return false; lost = false; const body = route.request().postDataJSON() as AdminActionBody; current.bodies.push(body); applyAdminAction(current, body);
    await json(route, { code: 'temporarily_unavailable', message: 'Não foi possível confirmar agora.' }, 503); return true;
  } });
  await page.goto(accountPath); await page.getByRole('button', { name: 'Bloquear acesso por segurança', exact: true }).click(); await page.getByLabel('Motivo administrativo', { exact: true }).fill('Conferência de segurança');
  await page.getByRole('button', { name: 'Confirmar ação administrativa', exact: true }).click(); await page.getByRole('button', { name: 'Consultar operação administrativa', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible(); expect(state.bodies).toHaveLength(1); expect(state.calls.some(call => call.includes(`/operacoes/${state.bodies[0].operationId}`))).toBe(true);
});
test('409 preserva motivo mas exige revisão explícita do alvo atual', async ({ page }) => {
  const { state } = await mockAdmin(page); await page.goto(accountPath); await page.getByRole('button', { name: 'Bloquear acesso por segurança', exact: true }).click();
  const field = page.getByLabel('Motivo administrativo', { exact: true }); await field.fill('Rascunho preservado'); state.accounts[0].version = 2;
  await page.getByRole('button', { name: 'Confirmar ação administrativa', exact: true }).click(); await expect(field).toHaveValue('Rascunho preservado');
  await page.getByRole('button', { name: 'Revisar estado atual', exact: true }).click(); await page.getByRole('button', { name: 'Confirmar ação administrativa', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible(); expect(state.bodies[0].expectedVersion).toBe(0); expect(state.bodies[1].expectedVersion).toBe(2); expect(state.bodies[0].operationId).not.toBe(state.bodies[1].operationId);
});
test('autoproteção não oferece bloquear conta com grant ativo', async ({ page }) => {
  const { state } = await mockAdmin(page); state.accounts[0].canBlock = false; await page.goto(accountPath);
  await expect(page.getByRole('button', { name: 'Bloquear acesso por segurança', exact: true })).toHaveCount(0); expect(state.bodies).toHaveLength(0);
});

test('429 preserva motivo e consulta antes de repetir a mesma UUID', async ({ page }) => {
  let limited = true; const captured: AdminActionBody[] = [];
  const { state } = await mockAdmin(page, { handler: async (route, url) => {
    if (url.pathname !== '/api/admin/acoes') return false; captured.push(route.request().postDataJSON()); if (!limited) return false; limited = false;
    await json(route, { code: 'rate_limited', message: 'Aguarde para realizar outra ação administrativa.' }, 429); return true;
  } });
  await page.goto(accountPath); await page.getByRole('button', { name: 'Bloquear acesso por segurança', exact: true }).click(); await page.getByLabel('Motivo administrativo', { exact: true }).fill('Motivo preservado');
  await page.getByRole('button', { name: 'Confirmar ação administrativa', exact: true }).click(); await expect(page.getByLabel('Motivo administrativo', { exact: true })).toHaveAttribute('readonly', '');
  await page.getByRole('button', { name: 'Consultar operação administrativa', exact: true }).click(); await expect(page.getByRole('dialog')).not.toBeVisible();
  expect(captured).toHaveLength(2); expect(captured[0]).toEqual(captured[1]); expect(state.history).toHaveLength(1);
});

test('reload recupera ação pela UUID sem persistir motivo ou reenviar', async ({ page }) => {
  let lost = true; const { state } = await mockAdmin(page, { handler: async (route, url, current) => {
    if (url.pathname !== '/api/admin/acoes' || !lost) return false; lost = false; const body = route.request().postDataJSON() as AdminActionBody; current.bodies.push(body); applyAdminAction(current, body);
    await json(route, { code: 'temporarily_unavailable', message: 'Não foi possível confirmar agora.' }, 503); return true;
  } });
  await page.goto(accountPath); await page.getByRole('button', { name: 'Bloquear acesso por segurança', exact: true }).click(); await page.getByLabel('Motivo administrativo', { exact: true }).fill('Motivo não persistido');
  await page.getByRole('button', { name: 'Confirmar ação administrativa', exact: true }).click(); await expect(page).toHaveURL(/operacao=[0-9a-f-]{36}/);
  await page.reload(); await expect(page.getByRole('button', { name: 'Reativar acesso', exact: true })).toBeVisible(); await expect(page.getByRole('dialog')).not.toBeVisible(); expect(state.bodies).toHaveLength(1);
});
