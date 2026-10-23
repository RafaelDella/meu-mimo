import { expect } from '@playwright/test';
import { test, mockAdmin, accountPath, noOverflow, actionsFit } from './helpers';

test('diálogo mantém teclado Escape retorno de foco e200% com movimento reduzido', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); await mockAdmin(page); await page.goto(accountPath);
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; }); const trigger = page.getByRole('button', { name: 'Bloquear acesso por segurança', exact: true }); await trigger.click();
  const dialog = page.getByRole('dialog'); await expect(dialog).toBeVisible(); const confirm = dialog.getByRole('button', { name: 'Confirmar ação administrativa', exact: true });
  await confirm.focus(); await page.keyboard.press('Tab'); await expect(dialog.getByRole('button', { name: 'Fechar', exact: true })).toBeFocused(); await page.keyboard.press('Shift+Tab'); await expect(confirm).toBeFocused();
  await page.screenshot({ path: `.artifacts/t13-dialog-${testInfo.project.name}.png`, fullPage: true }); await noOverflow(page); await actionsFit(page);
  await page.keyboard.press('Escape'); await expect(dialog).not.toBeVisible(); await expect(trigger).toBeFocused();
});
test('lista e auditoria cabem em200% e geram capturas locais', async ({ page }, testInfo) => {
  await mockAdmin(page); await page.goto('/admin/contas'); await expect(page.getByRole('heading', { name: 'Pessoa de metadados', exact: true })).toBeVisible();
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; }); await noOverflow(page); await page.screenshot({ path: `.artifacts/t13-list-${testInfo.project.name}.png`, fullPage: true });
  await page.getByRole('link', { name: 'Abrir metadados da conta', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Histórico administrativo', exact: true })).toBeVisible();
  await noOverflow(page); await page.screenshot({ path: `.artifacts/t13-history-${testInfo.project.name}.png`, fullPage: true });
});
