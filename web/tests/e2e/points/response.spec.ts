import { expect } from '@playwright/test';
import type { ResponseBody } from '../../../src/contracts/activities';
import { actionsFit, applyResponse, eventId, mockReview, noOverflow, originPath, photo, test } from './helpers';
import { json } from '../stores/helpers';

test('resposta formal em texto preserva legenda e mantém contestação sem crédito', async ({ page }) => {
  const { state } = await mockReview(page, { merchant: false, status: 'CONTESTED' }); await page.goto(originPath);
  const send = page.getByRole('button', { name: 'Confirmar complemento', exact: true }); await expect(send).toBeEnabled();
  await page.getByRole('textbox', { name: 'Sua resposta à contestação', exact: true }).fill('Fiz a leitura pela manhã.'); await send.click();
  await expect(page.getByText('Complemento confirmado. O registro continua em contestação, sem mudança nos pontos.', { exact: true })).toBeVisible();
  await expect(page.getByText('Legenda inicial preservada.', { exact: true })).toBeVisible();
  await expect(page.getByText('Em contestação', { exact: true })).toBeVisible();
  expect(state.bodies[0]).toMatchObject({ requestId: eventId, evidenceRevision: 2, expectedVersion: 0, text: 'Fiz a leitura pela manhã.', evidenceAssetId: null });
  expect(state.balance).toBe('0'); expect(state.events[0].kind).toBe('RESPOND');
});
test('complemento vazio tem validação e foco sem POST', async ({ page }) => {
  const { state } = await mockReview(page, { merchant: false, status: 'CONTESTED' }); await page.goto(originPath);
  await page.getByRole('button', { name: 'Confirmar complemento', exact: true }).click();
  const field = page.getByRole('textbox', { name: 'Sua resposta à contestação', exact: true });
  await expect(field).toBeFocused(); await expect(field).toHaveAccessibleDescription(/Escreva uma resposta ou prepare uma foto/); expect(state.bodies).toHaveLength(0);
});
test('resposta Unicode com 501 caracteres é preservada para corrigir', async ({ page }) => {
  const { state } = await mockReview(page, { merchant: false, status: 'CONTESTED' }); await page.goto(originPath);
  const field = page.getByRole('textbox', { name: 'Sua resposta à contestação', exact: true }); await field.fill('🌷'.repeat(501));
  await page.getByRole('button', { name: 'Confirmar complemento', exact: true }).click();
  await expect(field).toHaveAttribute('aria-invalid', 'true'); await expect(field).toHaveValue('🌷'.repeat(501)); expect(state.bodies).toHaveLength(0);
});
test('foto local inválida bloqueia complemento mesmo com texto válido', async ({ page }) => {
  await mockReview(page, { merchant: false, status: 'CONTESTED' }); await page.goto(originPath);
  await page.getByRole('textbox', { name: 'Sua resposta à contestação', exact: true }).fill('Texto válido com foto a revisar.');
  await page.getByLabel('Escolher arquivos da galeria', { exact: true }).setInputFiles({ name: 'recusada.heic', mimeType: 'image/heic', buffer: Buffer.from('contrato sintético') });
  await expect(page.getByRole('button', { name: 'Confirmar complemento', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Remover arquivo', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Confirmar complemento', exact: true })).toBeEnabled();
});
test('foto nova exige READY e foto anterior não integra seleção do complemento', async ({ page }) => {
  const { state } = await mockReview(page, { merchant: false, status: 'CONTESTED' });
  const previous = 'c1111111-1111-4111-8111-111111111111'; state.assets.set(previous, photo(previous)); state.current.evidenceAssetId = previous;
  await page.goto(originPath); await expect(page.getByText('Este complemento está sem foto nova.', { exact: true })).toBeVisible();
  await page.getByLabel('Escolher arquivos da galeria', { exact: true }).setInputFiles({ name: 'complemento.png', mimeType: 'image/png', buffer: Buffer.from('nova foto sintética') });
  await expect(page.getByRole('button', { name: 'Confirmar complemento', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Enviar arquivos selecionados', exact: true }).click();
  await expect(page.getByText('Recebido. Preparando a mídia para consulta.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Confirmar complemento', exact: true })).toBeDisabled();
  state.ready = true; await page.getByRole('button', { name: 'Atualizar arquivos', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Confirmar complemento', exact: true })).toBeEnabled();
  await noOverflow(page); await actionsFit(page); await page.screenshot({ path: `.artifacts/t08-response-${page.viewportSize()!.width}.png`, fullPage: true });
  await page.getByRole('button', { name: 'Confirmar complemento', exact: true }).click();
  await expect(page.getByText('Complemento confirmado. O registro continua em contestação, sem mudança nos pontos.', { exact: true })).toBeVisible();
  expect(state.bodies[0].evidenceAssetId).not.toBe(previous); expect(state.assets.get(previous)?.publishedAt).toBeTruthy(); expect(state.current.evidenceAssetId).toBe(previous);
});
test('decisão antes do complemento fecha solicitação e preserva texto para copiar', async ({ page }) => {
  await mockReview(page, { merchant: false, status: 'CONTESTED', handler: async (route, url, current) => {
    if (!url.pathname.endsWith('/resposta')) return false;
    current.current.status = 'APPROVED'; current.current.pointsState = 'CREDITED'; current.responded = true;
    await json(route, { code: 'review_changed', message: 'A análise mudou antes da resposta.' }, 409); return true;
  } });
  await page.goto(originPath); await page.getByRole('textbox', { name: 'Sua resposta à contestação', exact: true }).fill('Resposta preservada após a corrida.');
  await page.getByRole('button', { name: 'Confirmar complemento', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Confirmar complemento', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Atualizar solicitação', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Texto preservado para copiar', exact: true })).toHaveValue('Resposta preservada após a corrida.');
  await expect(page.getByRole('button', { name: 'Confirmar complemento', exact: true })).toHaveCount(0);
});
test('resposta perdida consulta UUID original e não confirma segundo complemento', async ({ page }) => {
  const { state } = await mockReview(page, { merchant: false, status: 'CONTESTED', handler: async (route, url, current) => {
    if (!url.pathname.endsWith('/resposta')) return false;
    const body = route.request().postDataJSON() as ResponseBody; current.bodies.push(body); current.calls.push('POST:response'); applyResponse(current, body);
    await route.abort('failed'); return true;
  } });
  await page.goto(originPath); await page.getByRole('textbox', { name: 'Sua resposta à contestação', exact: true }).fill('Texto confirmado uma vez.');
  await page.getByRole('button', { name: 'Confirmar complemento', exact: true }).click();
  await page.getByRole('button', { name: 'Consultar complemento', exact: true }).click();
  await expect(page.getByText('Complemento confirmado. O registro continua em contestação, sem mudança nos pontos.', { exact: true })).toBeVisible();
  expect(state.bodies).toHaveLength(1); expect(state.calls.filter(call => call !== 'GET:submission')).toEqual(['POST:response', 'GET:operation']);
});
test('loja pausada mantém complemento de solicitação existente', async ({ page }) => {
  const { auth } = await mockReview(page, { merchant: false, status: 'CONTESTED' }); auth.stores[0].state = 'PAUSED'; await page.goto(originPath);
  await expect(page.getByText('Esta loja está pausada.', { exact: false })).toBeVisible();
  await page.getByRole('textbox', { name: 'Sua resposta à contestação', exact: true }).fill('Complemento permitido durante a pausa.');
  await page.getByRole('button', { name: 'Confirmar complemento', exact: true }).click();
  await expect(page.getByText('Complemento confirmado. O registro continua em contestação, sem mudança nos pontos.', { exact: true })).toBeVisible();
});
for (const merchant of [false, true]) test(`relação encerrada permite consulta sem ação de ${merchant ? 'análise' : 'complemento'}`, async ({ page }) => {
  await mockReview(page, { merchant, status: 'CONTESTED', closed: true }); await page.goto(originPath);
  await expect(page.getByRole('heading', { name: 'Histórico deste registro', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Confirmar complemento', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Aprovar registro', exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Conversa deste item', exact: true })).toBeVisible();
});
