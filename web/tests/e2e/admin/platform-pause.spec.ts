import { expect } from '@playwright/test';
import { test, ids } from './helpers';
import { mockApi, store } from '../stores/helpers';
import { mockActivities, activityId, rootPath, registerPath, submission } from '../activities/helpers';
import { mockRewards, detailPath } from '../redemptions/helpers';
import { mockTickets, ticketPath } from '../tickets/helpers';

const pause = '2026-10-23T12:00:00Z';
test('loja normal mostra duas pausas sem motivo e bloqueia convite novo', async ({ page }) => {
  const auth = await mockApi(page); auth.stores = [store({ role: 'MERCHANT', state: 'PAUSED', platformPausedAt: pause })]; await page.goto(`/lojas/${ids.first}/convites`);
  await expect(page.getByText(/Novas ações pausadas pela plataforma\./)).toBeVisible(); await expect(page.getByText(/Esta loja está pausada\./)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Gerar convite', exact: true })).toHaveCount(0); await expect(page.getByText(/motivo administrativo/i)).toHaveCount(0);
});
test('pausa bloqueia registro direto e upload de rascunho sem fechar o histórico', async ({ page }) => {
  const { state, auth } = await mockActivities(page); auth.stores = [store({ platformPausedAt: pause })]; await page.goto(`${rootPath}/${activityId}`);
  await expect(page.getByRole('link', { name: 'Registrar conquista', exact: true })).toHaveCount(0);
  await expect(page.getByText(/Novos registros e evidências de novas conquistas estão pausados pela plataforma/)).toBeVisible();
  const id = 'a1111111-1111-4111-8111-111111111111'; state.drafts.set(id, submission(state.activity, id)); await page.goto(`${registerPath}?rascunho=${id}`);
  await expect(page.getByRole('button', { name: 'Enviar registro', exact: true })).toBeDisabled(); await expect(page.getByRole('button', { name: 'Escolher da galeria', exact: true })).toHaveCount(0);
  expect(state.finalCalls.some(call => call.startsWith('POST'))).toBe(false);
});
test('pausa bloqueia resgate apesar de DTO anterior elegível e preserva ticket existente', async ({ page }) => {
  const rewards = await mockRewards(page); rewards.auth.stores = [store({ platformPausedAt: pause })]; await page.goto(detailPath);
  await expect(page.getByRole('button', { name: 'Resgatar mimo', exact: true })).toBeDisabled(); await expect(page.getByText('Novos resgates estão pausados pela plataforma. Os tickets já emitidos continuam acessíveis.', { exact: true })).toBeVisible();
});
test('lojista ainda pode realizar ticket existente sob pausa da plataforma', async ({ page }) => {
  const { auth } = await mockTickets(page, { merchant: true }); auth.stores = [store({ role: 'MERCHANT', platformPausedAt: pause })]; await page.goto(ticketPath);
  await expect(page.getByRole('button', { name: 'Marcar realização', exact: true })).toBeEnabled(); await expect(page.getByRole('heading', { name: 'Conversa deste item', exact: true })).toBeVisible();
});
