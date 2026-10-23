import { expect } from '@playwright/test';
import type { TicketTransitionBody } from '../../../src/contracts/redemptions';
import { json } from '../stores/helpers';
import { applyTransition, mockTickets, test, ticketPath } from './helpers';

test('resposta perdida consulta operação e não duplica realização', async ({ page }) => {
  let posted = 0;
  const { state } = await mockTickets(page, { merchant: true, handler: async (route, url, mock) => {
    if (!url.pathname.endsWith('/transicoes')) return false;
    posted += 1; const body = route.request().postDataJSON() as TicketTransitionBody;
    mock.bodies.push(body); applyTransition(mock, body); await route.abort('failed'); return true;
  } });
  await page.goto(ticketPath); await page.getByRole('button', { name: 'Marcar realização', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar realização', exact: true }).click();
  await expect(page).toHaveURL(/transicao=[\da-f-]+/); await page.getByRole('dialog').getByRole('button', { name: 'Consultar resultado da operação', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Situação atual do ticket', exact: true })).toContainText('Realizado em');
  await expect(page).toHaveURL(ticketPath); expect(posted).toBe(1); expect(state.history).toHaveLength(2);
});

test('reload com UUID consulta primeiro e recupera cancelamento já aplicado', async ({ page }) => {
  let posted = 0;
  const { state } = await mockTickets(page, { merchant: true, handler: async (route, url, mock) => {
    if (!url.pathname.endsWith('/transicoes')) return false;
    posted += 1; const body = route.request().postDataJSON() as TicketTransitionBody;
    mock.bodies.push(body); applyTransition(mock, body); await route.abort('failed'); return true;
  } });
  await page.goto(ticketPath); await page.getByRole('button', { name: 'Cancelar e devolver pontos', exact: true }).click();
  await page.getByRole('textbox', { name: 'Motivo do cancelamento', exact: true }).fill('Motivo privado que não pode entrar na URL');
  await page.getByRole('button', { name: 'Confirmar cancelamento e devolução', exact: true }).click();
  await expect(page).toHaveURL(/transicao=/); expect(page.url()).not.toContain('Motivo');
  await page.reload(); await expect(page.getByRole('status').filter({ hasText: 'operação da versão 2 confirmada' })).toBeVisible();
  await expect(page).toHaveURL(ticketPath); expect(posted).toBe(1); expect(state.reward!.balance).toBe('15');
  const storage = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } })); expect(storage).not.toContain('Motivo privado');
});

test('consulta de UUID ausente exige revisão e confirmação nova sem repetição automática', async ({ page }) => {
  const { state } = await mockTickets(page, { merchant: true });
  await page.goto(`${ticketPath}?transicao=71111111-1111-4111-8111-111111111111`);
  await expect(page.getByRole('button', { name: 'Consultar estado atual para revisão', exact: true })).toBeVisible();
  expect(state.bodies).toHaveLength(0); await expect(page.getByRole('button', { name: 'Marcar realização', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Consultar estado atual para revisão', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Marcar realização', exact: true })).toBeVisible(); expect(state.bodies).toHaveLength(0);
});

test('409 consulta intenção, preserva texto e exige revisar versão antes de nova confirmação', async ({ page }) => {
  let posted = 0;
  const { state } = await mockTickets(page, { merchant: true, handler: async (route, url, mock) => {
    if (!url.pathname.endsWith('/transicoes') || posted++) return false;
    mock.bodies.push(route.request().postDataJSON()); mock.current.version = 2;
    await json(route, { code: 'version_conflict', message: 'O estado mudou. Revise os dados.' }, 409); return true;
  } });
  await page.goto(ticketPath); await page.getByRole('button', { name: 'Registrar combinado', exact: true }).click();
  await page.getByRole('textbox', { name: 'Combinado', exact: true }).fill('Meu rascunho preservado'); await page.getByRole('button', { name: 'Salvar combinado', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Consultar estado atual para revisão', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Consultar estado atual para revisão', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Combinado', exact: true })).toHaveValue('Meu rascunho preservado'); expect(state.bodies).toHaveLength(1);
  await page.getByRole('button', { name: 'Salvar combinado', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0); expect(state.bodies).toHaveLength(2);
  expect(state.bodies[0].operationId).not.toBe(state.bodies[1].operationId); expect(state.bodies[1].expectedVersion).toBe(2);
  const calls = state.reward!.calls; expect(calls.findIndex(call => call.includes('/operacoes/'))).toBeGreaterThan(calls.findIndex(call => call.startsWith('POST') && call.endsWith('/transicoes')));
});

for (const status of [429, 503]) test(`${status} preserva intenção até consulta e nova revisão explícita`, async ({ page }) => {
  let posted = 0;
  const { state } = await mockTickets(page, { merchant: true, handler: async (route, url, mock) => {
    if (!url.pathname.endsWith('/transicoes') || posted++) return false;
    mock.bodies.push(route.request().postDataJSON()); await json(route, { code: 'temporarily_unavailable', message: 'Tente consultar o resultado.' }, status); return true;
  } });
  await page.goto(ticketPath); await page.getByRole('button', { name: 'Marcar realização', exact: true }).click(); await page.getByRole('button', { name: 'Confirmar realização', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Confirmar realização', exact: true })).toBeDisabled(); expect(state.bodies).toHaveLength(1);
  await page.getByRole('dialog').getByRole('button', { name: 'Consultar resultado da operação', exact: true }).click();
  await page.getByRole('button', { name: 'Consultar estado atual para revisão', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible(); expect(state.bodies).toHaveLength(1);
  await page.getByRole('button', { name: 'Confirmar realização', exact: true }).click(); await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(state.bodies).toHaveLength(2); expect(state.current.status).toBe('FULFILLED');
});

test('replay mostra operação aplicada e estado atual posterior sem voltar estado', async ({ page }) => {
  const id = '71111111-1111-4111-8111-111111111111';
  const { state } = await mockTickets(page, { merchant: true });
  applyTransition(state, { operationId: id, action: 'AGREE', text: 'Primeiro combinado', agreementDate: null, expectedVersion: 1 });
  applyTransition(state, { operationId: '72222222-2222-4222-8222-222222222222', action: 'FULFILL', expectedVersion: 2 });
  await page.goto(`${ticketPath}?transicao=${id}`);
  await expect(page.getByRole('status').filter({ hasText: 'operação da versão 2 confirmada. Estado atual: Realizado.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Marcar realização', exact: true })).toHaveCount(0); expect(state.bodies).toHaveLength(0);
});
