import { expect } from '@playwright/test';
import type { ReviewBody } from '../../../src/contracts/activities';
import { applyDecision, mockReview, originPath, test } from './helpers';
import { json } from '../stores/helpers';

test('resposta perdida consulta a mesma decisão sem novo POST ou crédito', async ({ page }) => {
  const { state } = await mockReview(page, { handler: async (route, url, current) => {
    if (!url.pathname.endsWith('/analise')) return false;
    const body = route.request().postDataJSON() as ReviewBody; current.bodies.push(body); current.calls.push('POST:review'); applyDecision(current, body);
    await route.abort('failed'); return true;
  } });
  await page.goto(originPath); await page.getByRole('button', { name: 'Aprovar registro', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar decisão', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Consultar decisão', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Consultar decisão', exact: true }).click();
  await expect(page.getByText('Aprovado manualmente', { exact: true })).toBeVisible();
  expect(state.calls.filter(call => call !== 'GET:submission')).toEqual(['POST:review', 'GET:operation']); expect(state.entries).toHaveLength(1);
});
for (const status of [503, 429]) test(`falha ${status} preserva UUID e motivo e consulta antes de repetir`, async ({ page }) => {
  let failed = false;
  const { state } = await mockReview(page, { handler: async (route, url, current) => {
    if (failed || !url.pathname.endsWith('/analise')) return false;
    failed = true; current.bodies.push(route.request().postDataJSON()); current.calls.push('POST:review');
    await json(route, { code: 'temporarily_unavailable', message: 'Consulte o resultado da mesma operação.' }, status); return true;
  } });
  await page.goto(originPath); await page.getByRole('button', { name: 'Contestar registro', exact: true }).click();
  const field = page.getByRole('textbox', { name: 'Motivo da decisão', exact: true }); await field.fill('Motivo preservado com acentos.');
  await page.getByRole('button', { name: 'Confirmar decisão', exact: true }).click();
  await expect(field).toHaveValue('Motivo preservado com acentos.'); await expect(field).toHaveAttribute('readonly', '');
  await page.getByRole('button', { name: 'Consultar decisão', exact: true }).click();
  await expect(page.getByText('Em contestação', { exact: true })).toBeVisible();
  expect(state.bodies[1]).toEqual(state.bodies[0]); expect(state.calls.filter(call => call !== 'GET:submission')).toEqual(['POST:review', 'GET:operation', 'POST:review']);
});
test('saldo mudou exige revisão explícita e usa nova prévia sem perder motivo', async ({ page }) => {
  let changed = false;
  const { state } = await mockReview(page, { status: 'APPROVED', balance: '15', handler: async (route, url, current) => {
    if (changed || !url.pathname.endsWith('/analise')) return false;
    changed = true; current.bodies.push(route.request().postDataJSON()); current.balance = '20';
    await json(route, { code: 'balance_changed', message: 'O saldo mudou. Revise o impacto.' }, 409); return true;
  } });
  await page.goto(originPath); await page.getByRole('button', { name: 'Anular registro', exact: true }).click();
  const field = page.getByRole('textbox', { name: 'Motivo da decisão', exact: true }); await field.fill('Corrigir o crédito desta ocasião.');
  await page.getByRole('button', { name: 'Confirmar decisão', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Confirmar decisão', exact: true })).toBeDisabled();
  await expect(field).toHaveValue('Corrigir o crédito desta ocasião.');
  await page.getByRole('button', { name: 'Atualizar análise', exact: true }).click();
  await expect(page.getByRole('dialog').getByText('20 pontos', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Confirmar decisão', exact: true }).click();
  await expect(page.getByText('Anulado', { exact: true })).toBeVisible();
  expect(state.bodies[1]).toMatchObject({ expectedBalance: '20', reason: 'Corrigir o crédito desta ocasião.' });
  expect(state.bodies[1].operationId).not.toBe(state.bodies[0].operationId);
});
test('decisão concorrente atualiza capacidades e não reaplica intenção antiga', async ({ page }) => {
  const { state } = await mockReview(page, { handler: async (route, url, current) => {
    if (!url.pathname.endsWith('/analise')) return false;
    current.current.status = 'VOIDED'; current.current.pointsState = 'NONE'; current.current.analysis!.version += 1;
    await json(route, { code: 'review_changed', message: 'A análise mudou. Confira a decisão atual.' }, 409); return true;
  } });
  await page.goto(originPath); await page.getByRole('button', { name: 'Aprovar registro', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar decisão', exact: true }).click(); await page.getByRole('button', { name: 'Atualizar análise', exact: true }).click();
  await expect(page.getByText('Anulado', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Confirmar decisão', exact: true })).toBeDisabled(); expect(state.entries).toHaveLength(0);
});
test('401 durante decisão revalida sessão e descarta o motivo privado', async ({ page }) => {
  let expired = false;
  await mockReview(page, { handler: async (route, url) => {
    if (url.pathname.endsWith('/analise')) { expired = true; await json(route, { code: 'session_invalid', message: 'Entre novamente.' }, 401); return true; }
    if (expired && url.pathname === '/api/auth/session') { await json(route, { code: 'session_invalid', message: 'Entre novamente.' }, 401); return true; }
    return false;
  } });
  await page.goto(originPath); await page.getByRole('button', { name: 'Contestar registro', exact: true }).click();
  await page.getByRole('textbox', { name: 'Motivo da decisão', exact: true }).fill('Motivo privado da sessão anterior.');
  await page.getByRole('button', { name: 'Confirmar decisão', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Acesse sua conta', exact: true })).toBeVisible();
  await expect(page.getByText('Motivo privado da sessão anterior.', { exact: true })).toHaveCount(0);
});
test('404 durante decisão limpa registro sem sugerir outra autenticação', async ({ page }) => {
  await mockReview(page, { handler: async (route, url) => {
    if (!url.pathname.endsWith('/analise')) return false;
    await json(route, { code: 'resource_not_found', message: 'Conteúdo indisponível.' }, 404); return true;
  } });
  await page.goto(originPath); await page.getByRole('button', { name: 'Aprovar registro', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar decisão', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Acesso indisponível', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Ler algumas páginas', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Entrar na conta', exact: true })).toHaveCount(0);
});
test('toque repetido mantém uma decisão enquanto resposta está pendente', async ({ page }) => {
  let release: (() => void) | undefined;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  const { state } = await mockReview(page, { handler: async (route, url, current) => {
    if (!url.pathname.endsWith('/analise')) return false;
    current.bodies.push(route.request().postDataJSON()); await waiting;
    await json(route, applyDecision(current, current.bodies[0] as ReviewBody)); return true;
  } });
  await page.goto(originPath); await page.getByRole('button', { name: 'Aprovar registro', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar decisão', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Confirmando decisão…', exact: true })).toBeDisabled();
  expect(state.bodies).toHaveLength(1); release!();
  await expect(page.getByText('Aprovado manualmente', { exact: true })).toBeVisible(); expect(state.bodies).toHaveLength(1);
});
