import { expect } from '@playwright/test';
import { test, mockRelationship, ids, json, refresh } from './helpers';

async function openPreferences(page: import('@playwright/test').Page) {
  await page.goto('/conta'); await page.getByRole('combobox', { name: 'Loja das preferências', exact: true }).selectOption(ids.first);
  await expect(page.getByRole('heading', { name: 'Novidades desta loja', exact: true })).toBeVisible();
}
test('silenciar muda só atenção e conserva histórico/leitura e opção automática separada', async ({ page }) => {
  const { state } = await mockRelationship(page); await openPreferences(page);
  await expect(page.getByLabel('Avisar aprovações automáticas', { exact: true })).toBeChecked();
  await page.getByLabel('Silenciar interações desta loja', { exact: true }).check(); await page.getByRole('button', { name: 'Salvar preferências', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Alteração confirmada.' })).toBeVisible();
  expect(state.preferenceBodies[0]).toMatchObject({ expectedVersion: 0, socialMuted: true, automaticApprovalNotices: true });
  expect(state.groups).toHaveLength(1); expect(state.groups[0].unreadCount).toBe(1); expect(state.groups[0].attentionActive).toBe(false); expect(state.read.size).toBe(0);
  await page.getByLabel('Avisar aprovações automáticas', { exact: true }).uncheck(); await page.getByRole('button', { name: 'Salvar preferências', exact: true }).click();
  await expect.poll(() => state.preferenceBodies.length).toBe(2); expect(state.preferenceBodies[1]).toMatchObject({ expectedVersion: 1, automaticApprovalNotices: false });
});

test('preferência de outro dispositivo é reconsultada sem escrita implícita', async ({ page }) => {
  const { state } = await mockRelationship(page); await openPreferences(page);
  state.preferences = { ...state.preferences, version: 1, socialMuted: true, automaticApprovalNotices: false }; await refresh(page);
  await expect(page.getByLabel('Silenciar interações desta loja', { exact: true })).toBeChecked();
  await expect(page.getByLabel('Avisar aprovações automáticas', { exact: true })).not.toBeChecked(); expect(state.preferenceBodies).toHaveLength(0);
});

test('429 conserva opções até consultar/repetir a mesma intenção', async ({ page }) => {
  let limited = true; const bodies: unknown[] = [];
  await mockRelationship(page, { handler: async (route, url) => {
    if (!url.pathname.endsWith('/preferencias/notificacoes') || route.request().method() !== 'PATCH') return false;
    bodies.push(route.request().postDataJSON()); if (!limited) return false; limited = false;
    await json(route, { code: 'rate_limited', message: 'Aguarde para alterar as preferências.' }, 429); return true;
  } });
  await openPreferences(page); await page.getByLabel('Silenciar interações desta loja', { exact: true }).check(); await page.getByRole('button', { name: 'Salvar preferências', exact: true }).click();
  await expect(page.getByLabel('Silenciar interações desta loja', { exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Consultar alteração das preferências', exact: true }).click();
  await expect(page.getByLabel('Silenciar interações desta loja', { exact: true })).toBeEnabled(); expect(bodies).toHaveLength(2); expect(bodies[0]).toEqual(bodies[1]);
});
