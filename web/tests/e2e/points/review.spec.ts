import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { actionsFit, mockReview, noOverflow, originPath, test } from './helpers';

async function decide(page: Page, label: string, reason = '') {
  await page.getByRole('button', { name: label, exact: true }).click();
  const dialog = page.getByRole('dialog');
  if (reason) await dialog.getByRole('textbox', { name: 'Motivo da decisão', exact: true }).fill(reason);
  await dialog.getByRole('button', { name: 'Confirmar decisão', exact: true }).click();
  await expect(dialog).not.toBeVisible();
}
test('aprovação manual confirma pontos e autoria sem chamar de automática', async ({ page }) => {
  const { state } = await mockReview(page); await page.goto(originPath);
  await decide(page, 'Aprovar registro');
  await expect(page.getByText('Aprovado manualmente', { exact: true })).toBeVisible();
  await expect(page.getByText('Crédito confirmado', { exact: false }).first()).toBeVisible();
  await expect(page.getByText('Última aprovação manual', { exact: true })).toBeVisible();
  expect(state.bodies[0]).toMatchObject({ action: 'APPROVE', expectedVersion: 0, expectedBalance: '0', reason: '' });
  expect(state.entries.map(entry => entry.amount)).toEqual(['15']);
});
for (const credited of [false, true]) test(`contestar ${credited ? 'com' : 'sem'} crédito distingue análise e pontos`, async ({ page }) => {
  const { state } = await mockReview(page, { status: credited ? 'APPROVED' : 'PENDING', credited }); await page.goto(originPath);
  await decide(page, 'Contestar registro', 'Preciso entender melhor a evidência.');
  await expect(page.getByText('Em contestação', { exact: true })).toBeVisible();
  await expect(page.getByText(credited ? 'Os pontos continuam contabilizados até a decisão.' : 'Este registro está em contestação. Nenhum ponto deste registro está disponível.', { exact: true })).toBeVisible();
  expect(state.balance).toBe(credited ? '15' : '0'); expect(state.events[0].delta).toBe('0');
});
test('anulação confirma impacto negativo exato e preserva histórico sem celebração', async ({ page }) => {
  const { state } = await mockReview(page, { status: 'APPROVED', balance: '5' }); await page.goto(originPath);
  await page.getByRole('button', { name: 'Anular registro', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('-10 pontos', { exact: true })).toBeVisible();
  await expect(dialog.getByText('O saldo ficará negativo por este ajuste. Novos resgates dependerão de saldo suficiente.', { exact: true })).toBeVisible();
  await dialog.getByRole('textbox', { name: 'Motivo da decisão', exact: true }).fill('A foto não corresponde à conquista.');
  await noOverflow(page); await actionsFit(page);
  await page.screenshot({ path: `.artifacts/t08-void-${page.viewportSize()!.width}.png`, fullPage: true });
  await dialog.getByRole('button', { name: 'Confirmar decisão', exact: true }).click();
  await expect(page.getByText('Anulado', { exact: true })).toBeVisible();
  await expect(page.getByText('Crédito estornado', { exact: false }).first()).toBeVisible();
  await expect(page.getByText(/Conquista registrada!/)).toHaveCount(0);
  expect(state.balance).toBe('-10'); expect(state.entries[0].amount).toBe('-15');
});
test('anular pendente mostra ajuste zero e não cria débito', async ({ page }) => {
  const { state } = await mockReview(page); await page.goto(originPath);
  await page.getByRole('button', { name: 'Anular registro', exact: true }).click();
  await expect(page.getByRole('dialog').getByText('Esta decisão não adiciona nem remove pontos.', { exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: 'Motivo da decisão', exact: true }).fill('Registro enviado por engano.');
  await page.getByRole('button', { name: 'Confirmar decisão', exact: true }).click();
  await expect(page.getByText('Anulado', { exact: true })).toBeVisible(); expect(state.entries).toHaveLength(0);
});
test('reabrir volta à análise sem recomposição automática', async ({ page }) => {
  const { state } = await mockReview(page, { status: 'VOIDED' }); await page.goto(originPath);
  await decide(page, 'Reabrir análise', 'Vou revisar a decisão anterior.');
  await expect(page.getByText('Aguardando aprovação', { exact: true })).toBeVisible();
  expect(state.balance).toBe('0'); expect(state.events[0].delta).toBe('0');
  await decide(page, 'Aprovar registro'); expect(state.balance).toBe('15');
});
test('manter aprovação contestada não credita novamente', async ({ page }) => {
  const { state } = await mockReview(page, { status: 'CONTESTED', credited: true }); await page.goto(originPath);
  await decide(page, 'Manter aprovação');
  expect(state.balance).toBe('15'); expect(state.events[0].delta).toBe('0'); expect(state.entries).toHaveLength(1);
});
test('ciclos de anulação e reabertura preservam lançamento e snapshot originais', async ({ page }) => {
  const { state } = await mockReview(page); await page.goto(originPath);
  await decide(page, 'Aprovar registro');
  for (let cycle = 0; cycle < 2; cycle += 1) {
    await decide(page, 'Anular registro', `Correção ${cycle + 1}`);
    await decide(page, 'Reabrir análise', `Revisão ${cycle + 1}`);
    await decide(page, 'Aprovar registro');
  }
  expect(state.balance).toBe('15'); expect(state.entries.map(entry => entry.amount)).toEqual(['15', '-15', '15', '-15', '15']);
  await expect(page.getByText('Legenda inicial preservada.', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Histórico deste registro', exact: true })).toBeVisible();
});
test('motivo obrigatório e Unicode acima do limite têm erro associado e foco', async ({ page }) => {
  const { state } = await mockReview(page); await page.goto(originPath);
  await page.getByRole('button', { name: 'Contestar registro', exact: true }).click();
  const field = page.getByRole('textbox', { name: 'Motivo da decisão', exact: true });
  await page.getByRole('button', { name: 'Confirmar decisão', exact: true }).click();
  await expect(field).toBeFocused(); await expect(field).toHaveAttribute('aria-invalid', 'true');
  await field.fill('💜'.repeat(501)); await page.getByRole('button', { name: 'Confirmar decisão', exact: true }).click();
  await expect(field).toHaveAccessibleDescription(/Use até 500 caracteres/); expect(state.bodies).toHaveLength(0);
  await field.fill('💜'.repeat(500)); await page.getByRole('button', { name: 'Confirmar decisão', exact: true }).click();
  await expect(page.getByText('Em contestação', { exact: true })).toBeVisible(); expect([...String(state.bodies[0].reason)]).toHaveLength(500);
});
test('diálogo aceita teclado e Escape devolve foco sem decisão', async ({ page }) => {
  const { state } = await mockReview(page); await page.goto(originPath);
  const trigger = page.getByRole('button', { name: 'Contestar registro', exact: true }); await trigger.focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible(); await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible(); await expect(trigger).toBeFocused(); expect(state.bodies).toHaveLength(0);
});
test('prévia usa inteiro exato acima de MAX_SAFE_INTEGER', async ({ page }) => {
  await mockReview(page, { status: 'APPROVED', balance: '9007199254740993' }); await page.goto(originPath);
  await page.getByRole('button', { name: 'Anular registro', exact: true }).click();
  await expect(page.getByRole('dialog').getByText('9.007.199.254.740.993 pontos', { exact: true })).toBeVisible();
  await expect(page.getByRole('dialog').getByText('9.007.199.254.740.978 pontos', { exact: true })).toBeVisible();
});
