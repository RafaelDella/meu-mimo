import { expect } from '@playwright/test';
import { test, mockAlbums, openAlbum, selectReady, noOverflow, actionsFit } from './helpers';

test('revisão parcial cabe em 320/390 com texto200%, foco e movimento reduzido', async ({ page }, info) => {
  await mockAlbums(page); await page.emulateMedia({ reducedMotion: 'reduce' }); await openAlbum(page);
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  await selectReady(page, 2); await page.getByLabel('Legenda do momento 1', { exact: true }).fill('Um momento privado com carinho 🌷');
  const opener = page.getByRole('button', { name: 'Publicar 2 momentos prontos', exact: true }); await page.keyboard.press('Tab'); await opener.focus();
  expect(await opener.evaluate(element => element.matches(':focus-visible') && getComputedStyle(element).outlineStyle !== 'none')).toBe(true);
  await page.keyboard.press('Enter'); const dialog = page.getByRole('dialog');
  const first = dialog.getByRole('button', { name: 'Fechar', exact: true }); const last = dialog.getByRole('button', { name: 'Confirmar publicação', exact: true });
  await first.focus(); await page.keyboard.press('Shift+Tab'); await expect(last).toBeFocused(); await page.keyboard.press('Tab'); await expect(first).toBeFocused();
  await noOverflow(page); await actionsFit(page);
  expect(await page.evaluate(() => document.getAnimations().filter(animation => animation.playState === 'running').length)).toBe(0);
  await page.screenshot({ path: `.artifacts/t11-publicacao-200-${info.project.name}.png`, fullPage: true });
  await page.keyboard.press('Escape'); await expect(opener).toBeFocused(); await noOverflow(page);
  await page.screenshot({ path: `.artifacts/t11-revisao-200-${info.project.name}.png`, fullPage: true });
});

test('álbum publicado e foto privada cabem com texto200% e fechamento por teclado', async ({ page }, info) => {
  await mockAlbums(page, { merchant: false, published: 1 }); await page.emulateMedia({ reducedMotion: 'reduce' }); await openAlbum(page);
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  const trigger = page.getByRole('button', { name: 'Abrir foto 1', exact: true }); await trigger.focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog').getByRole('img')).toBeVisible(); await noOverflow(page); await actionsFit(page);
  await page.screenshot({ path: `.artifacts/t11-galeria-200-${info.project.name}.png`, fullPage: true });
  await page.keyboard.press('Escape'); await expect(trigger).toBeFocused(); await noOverflow(page);
});
