import { expect } from '@playwright/test';
import { mockTickets, test, ticketPath } from './helpers';

test('lojista registra e revisa combinado com data passada e remoção explícita', async ({ page }) => {
  const { state } = await mockTickets(page, { merchant: true }); await page.goto(ticketPath);
  await page.getByRole('button', { name: 'Registrar combinado', exact: true }).click();
  await page.getByRole('textbox', { name: 'Combinado', exact: true }).fill('Café na nossa mesa');
  await page.getByLabel('Data do combinado', { exact: true }).fill('2026-10-01');
  await page.getByRole('button', { name: 'Salvar combinado', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Situação atual do ticket', exact: true })).toContainText('Data combinada: 01/10/2026');
  await expect(page.getByRole('dialog')).toHaveCount(0); await page.getByRole('button', { name: 'Revisar combinado', exact: true }).click();
  await page.getByRole('textbox', { name: 'Combinado', exact: true }).fill('Combinado revisado');
  await page.getByLabel('Data do combinado', { exact: true }).fill(''); await page.getByRole('button', { name: 'Salvar combinado', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Situação atual do ticket', exact: true })).toContainText('Sem data combinada.');
  await expect(page.getByRole('region', { name: 'Histórico deste ticket', exact: true })).toContainText('Café na nossa mesa');
  expect(state.bodies.map(body => body.action)).toEqual(['AGREE', 'AGREE']); expect(state.reward!.balance).toBe('5');
});

for (const status of ['WAITING_AGREEMENT', 'AGREED'] as const) test(`realização direta de ${status} encerra e atualiza contador sem débito`, async ({ page }) => {
  const { state } = await mockTickets(page, { merchant: true, status }); await page.goto(ticketPath);
  await page.getByRole('button', { name: 'Marcar realização', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar realização', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Situação atual do ticket', exact: true })).toContainText('Nenhum ponto foi descontado novamente.');
  await expect(page.getByRole('button', { name: 'Marcar realização', exact: true })).toHaveCount(0);
  await expect(page.getByRole('status').filter({ hasText: 'operação da versão 2 confirmada' })).toBeFocused();
  expect(state.reward!.balance).toBe('5'); expect(state.history).toHaveLength(2);
  expect(state.reward!.calls.filter(call => call.includes('/tickets/resumo')).length).toBeGreaterThanOrEqual(2);
});

test('participante pede cancelamento motivado e aguarda sem controles de lojista', async ({ page }) => {
  const { state } = await mockTickets(page); await page.goto(ticketPath);
  await expect(page.getByRole('button', { name: 'Marcar realização', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Pedir cancelamento', exact: true }).click();
  await page.getByRole('textbox', { name: 'Motivo do pedido', exact: true }).fill('Podemos deixar para outra ocasião?');
  await page.getByRole('button', { name: 'Enviar pedido de cancelamento', exact: true }).click();
  await expect(page.getByText('Seu pedido aguarda a decisão de quem gerencia a loja. A realização está bloqueada durante a análise.', { exact: true })).toBeVisible();
  expect(state.current.status).toBe('CANCELLATION_REQUESTED'); expect(state.reward!.balance).toBe('5');
});

for (const fromStatus of ['WAITING_AGREEMENT', 'AGREED'] as const) test(`recusa motivada restaura ${fromStatus} e preserva pedido`, async ({ page }) => {
  const { state } = await mockTickets(page, { merchant: true, status: 'CANCELLATION_REQUESTED' });
  state.current.pendingCancellation!.fromStatus = fromStatus;
  await page.goto(ticketPath); await expect(page.getByRole('button', { name: 'Marcar realização', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Recusar pedido', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Pedido privado da Ana');
  await page.getByRole('textbox', { name: 'Motivo da recusa', exact: true }).fill('Vamos manter nosso combinado.');
  await page.getByRole('button', { name: 'Confirmar recusa', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Marcar realização', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Histórico deste ticket', exact: true })).toContainText('Vamos manter nosso combinado.');
  expect(state.current.status).toBe(fromStatus); expect(state.reward!.balance).toBe('5');
});

for (const restock of [false, true]) test(`cancelamento confirma custo congelado e reposição ${restock}`, async ({ page }) => {
  const { state } = await mockTickets(page, { merchant: true }); state.reward!.current.cost = 999;
  await page.goto(ticketPath); await page.getByRole('button', { name: 'Cancelar e devolver pontos', exact: true }).click();
  const dialog = page.getByRole('dialog'); await expect(dialog).toContainText('10 pontos da ocasião'); await expect(dialog).toContainText('15 pontos');
  const checkbox = page.getByRole('checkbox', { name: 'Repor uma unidade no estoque', exact: true }); await expect(checkbox).not.toBeChecked();
  if (restock) await checkbox.check();
  await page.getByRole('textbox', { name: 'Motivo do cancelamento', exact: true }).fill('Vamos guardar o mimo para outra vez.');
  await page.getByRole('button', { name: 'Confirmar cancelamento e devolução', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Histórico deste ticket', exact: true })).toContainText(restock ? 'Uma unidade reposta no estoque.' : 'Sem reposição de estoque.');
  await expect(page.getByRole('button', { name: 'Cancelar e devolver pontos', exact: true })).toHaveCount(0);
  expect(state.reward!.balance).toBe('15'); expect(state.reward!.current.stock).toBe(restock ? 3 : 2);
  expect(state.bodies[0]).toMatchObject({ action: 'CANCEL', expectedBalance: '5', restock });
  expect('expectedStockRevision' in state.bodies[0]).toBe(restock);
});

test('catálogo ilimitado permite devolver sem oferecer reposição', async ({ page }) => {
  const { state } = await mockTickets(page, { merchant: true }); state.reward!.current.stock = null;
  await page.goto(ticketPath); await page.getByRole('button', { name: 'Cancelar e devolver pontos', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'Repor uma unidade no estoque', exact: true })).toHaveCount(0);
  await expect(page.getByRole('dialog')).toContainText('Reposição indisponível');
});

for (const status of ['FULFILLED', 'CANCELLED'] as const) test(`estado terminal ${status} mantém vale e conversa sem reabertura`, async ({ page }) => {
  await mockTickets(page, { merchant: true, status }); await page.goto(ticketPath);
  await expect(page.getByRole('article', { name: 'Seu vale mimo', exact: true })).toBeVisible();
  await expect(page.getByText('Este ticket está encerrado. O vale, o histórico e a conversa continuam disponíveis.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Registrar combinado|Marcar realização|Cancelar e devolver pontos|Recusar pedido/ })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: /Conversa/ })).toBeVisible();
});
