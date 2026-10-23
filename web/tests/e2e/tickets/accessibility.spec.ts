import { expect } from '@playwright/test';
import { actionsFit, mockTickets, noOverflow, test, ticketPath } from './helpers';

test('motivo vazio e 501 Unicode focam campo; 500 caracteres compostos são aceitos', async ({ page }) => {
  const { state } = await mockTickets(page); await page.goto(ticketPath); await page.getByRole('button', { name: 'Pedir cancelamento', exact: true }).click();
  const field = page.getByRole('textbox', { name: 'Motivo do pedido', exact: true }); const submit = page.getByRole('button', { name: 'Enviar pedido de cancelamento', exact: true });
  await submit.click(); await expect(field).toBeFocused(); await expect(field).toHaveAttribute('aria-invalid', 'true');
  await field.fill('🎁'.repeat(501)); await submit.click(); await expect(field).toBeFocused(); expect(state.bodies).toHaveLength(0);
  await field.fill('🎁'.repeat(500)); await expect(page.getByText('500 de 500 caracteres Unicode. Texto privado entre as pessoas desta relação.', { exact: true })).toBeVisible();
  await submit.click(); await expect(page.getByRole('dialog')).toHaveCount(0); expect(Array.from('text' in state.bodies[0] ? state.bodies[0].text : '')).toHaveLength(500);
});

test('combinado usa teclado, mantém foco no diálogo e devolve ao acionador por Escape', async ({ page }) => {
  await mockTickets(page, { merchant: true }); await page.goto(ticketPath);
  const trigger = page.getByRole('button', { name: 'Registrar combinado', exact: true }); await trigger.focus(); await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog'); const close = dialog.getByRole('button', { name: 'Fechar', exact: true }); const save = dialog.getByRole('button', { name: 'Salvar combinado', exact: true });
  await close.focus(); await page.keyboard.press('Shift+Tab'); await expect(save).toBeFocused(); await page.keyboard.press('Tab'); await expect(close).toBeFocused();
  await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0); await expect(trigger).toBeFocused();
});

test('cancelamento cabe em celular com texto 200%, alvos44 e movimento reduzido', async ({ page }, info) => {
  await mockTickets(page, { merchant: true, status: 'CANCELLATION_REQUESTED' }); await page.emulateMedia({ reducedMotion: 'reduce' }); await page.goto(ticketPath);
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  await page.getByRole('button', { name: 'Cancelar e devolver pontos', exact: true }).click();
  await page.getByRole('textbox', { name: 'Motivo do cancelamento', exact: true }).fill('Vamos combinar outra ocasião com carinho.');
  await noOverflow(page); await actionsFit(page);
  await page.screenshot({ path: `.artifacts/t10-cancelamento-200-${info.project.name}.png`, fullPage: true });
  await page.getByRole('button', { name: 'Confirmar cancelamento e devolução', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0); await noOverflow(page); await actionsFit(page);
  await page.screenshot({ path: `.artifacts/t10-cancelado-200-${info.project.name}.png`, fullPage: true });
});
