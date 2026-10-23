import { expect } from '@playwright/test';
import { test, mockRelationship, home } from './helpers';

for (const kind of ['loja', 'pessoa']) test(`busca de ${kind} aceita80Unicode e rejeita81 sem truncar emojis`, async ({ page }) => {
  const { state } = await mockRelationship(page, { merchant: kind === 'pessoa' }); await page.goto(kind === 'loja' ? '/notificacoes' : `${home}/mural`);
  const field = page.getByLabel(kind === 'loja' ? 'Buscar loja para selecionar' : 'Buscar pessoa no mural', { exact: true });
  const button = page.getByRole('button', { name: kind === 'loja' ? 'Buscar lojas' : 'Buscar pessoas do mural', exact: true });
  const name = '🌷'.repeat(80); await field.fill(name); await expect(field).toHaveValue(name); await button.click();
  await expect.poll(() => state.calls.some(call => {
    if (!call.startsWith('GET ')) return false; const url = new URL(call.slice(4), 'http://local.invalid');
    return url.pathname === (kind === 'loja' ? '/api/lojas' : `/api/lojas/${state.store.id}/participacoes`) && url.searchParams.get('q') === name;
  })).toBe(true);
  const count = state.calls.length; await field.fill(`${name}🌷`); await button.click(); await expect(field).toBeFocused(); await expect(field).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByRole('alert').filter({ hasText: `Use até 80 caracteres Unicode para buscar uma ${kind}.` })).toBeVisible();
  expect(state.calls.slice(count).some(call => call.includes(encodeURIComponent(`${name}🌷`)))).toBe(false);
});
