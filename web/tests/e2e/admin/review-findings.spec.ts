import { expect } from '@playwright/test';
import type { AdminActionBody } from '../../../src/contracts/admin';
import { test, mockAdmin, accountPath, applyAdminAction } from './helpers';

test('motivo vazio identifica o campo inválido e associa a explicação', async ({ page }) => {
  await mockAdmin(page); await page.goto(accountPath);
  await page.getByRole('button', { name: 'Bloquear acesso por segurança', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar ação administrativa', exact: true }).click();
  const field = page.getByRole('textbox', { name: 'Motivo administrativo', exact: true });
  await expect(field).toBeFocused(); await expect(field).toHaveAttribute('aria-invalid', 'true');
  await expect(field).toHaveAccessibleDescription(/Informe o motivo administrativo/);
});

test('resposta pendente expira e recupera a mesma operação sem outro comando', async ({ page }) => {
  await page.clock.install(); let release: (() => void) | undefined;
  const { state } = await mockAdmin(page, { handler: async (route, url, current) => {
    if (url.pathname !== '/api/admin/acoes') return false;
    const body = route.request().postDataJSON() as AdminActionBody;
    current.bodies.push(body); applyAdminAction(current, body);
    await new Promise<void>(resolve => { release = resolve; }); await route.abort(); return true;
  } });
  try {
    await page.goto(accountPath); await page.getByRole('button', { name: 'Bloquear acesso por segurança', exact: true }).click();
    await page.getByRole('textbox', { name: 'Motivo administrativo', exact: true }).fill('Conferência com resposta perdida');
    await page.getByRole('button', { name: 'Confirmar ação administrativa', exact: true }).click();
    await expect.poll(() => !!release).toBe(true); await page.clock.fastForward(21_000);
    await page.getByRole('button', { name: 'Consultar operação administrativa', exact: true }).click({ timeout: 2000 });
    await expect(page.getByRole('dialog')).not.toBeVisible(); expect(state.bodies).toHaveLength(1);
    expect(state.calls.some(call => call.includes(`/operacoes/${state.bodies[0].operationId}`))).toBe(true);
  } finally { release?.(); }
});
