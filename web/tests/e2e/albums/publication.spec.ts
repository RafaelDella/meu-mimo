import { expect } from '@playwright/test';
import { test, mockAlbums, openAlbum, selectReady, confirmPublish, asset, pixel } from './helpers';

test('publicação parcial é explícita e deixa falha no rascunho', async ({ page }) => {
  const { state } = await mockAlbums(page); await openAlbum(page);
  await expect(page.getByRole('button', { name: 'Publicar 0 momentos prontos', exact: true })).toBeDisabled();
  expect(state.bodies).toHaveLength(0);
  await selectReady(page); await page.getByLabel('Legenda do momento 1', { exact: true }).fill('Nosso café');
  await page.getByRole('button', { name: 'Publicar 4 momentos prontos', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('1 item ficará no rascunho');
  await page.getByRole('dialog').getByRole('button', { name: 'Voltar à revisão', exact: true }).click();
  expect(state.bodies).toHaveLength(0);
  await confirmPublish(page); await expect(page.getByRole('listitem', { name: /Momento publicado/ })).toHaveCount(4);
  expect(state.bodies).toHaveLength(1); expect(state.bodies[0].items.map(value => value.assetId)).toEqual(state.assets.slice(0, 4).map(value => value.id));
  await expect(page.getByRole('region', { name: 'Momentos publicados', exact: true }).getByRole('paragraph').filter({ hasText: /^Nosso café$/ })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Revisão da publicação' })).toContainText('Nenhum rascunho pronto');
  await expect(page.getByRole('listitem', { name: 'Vídeo enviado', exact: true }).filter({ hasText: 'não pôde ser processado' })).toHaveCount(1);
});

test('ordem revisada e legenda de 500 caracteres Unicode ficam imutáveis', async ({ page }) => {
  const { state } = await mockAlbums(page); await openAlbum(page);
  const caption = '🌷'.repeat(500);
  await page.getByLabel('Legenda do momento 1', { exact: true }).fill(caption);
  await page.getByRole('button', { name: 'Mover momento 1 depois', exact: true }).click();
  await expect(page.getByLabel('Legenda do momento 2', { exact: true })).toHaveValue(caption);
  await selectReady(page, 2); await confirmPublish(page, 2);
  await expect(page.getByRole('listitem', { name: 'Momento publicado 2', exact: true })).toContainText(caption);
  expect(state.bodies[0].items).toEqual([{ assetId: state.assets[1].id, caption: '' }, { assetId: state.assets[0].id, caption }]);
  await expect(page.getByLabel('Legenda do momento 1', { exact: true })).toHaveValue('');
  await expect(page.getByRole('listitem', { name: 'Momento publicado 2', exact: true }).locator('textarea')).toHaveCount(0);
});

test('501 caracteres impedem publicação e focam a legenda', async ({ page }) => {
  const { state } = await mockAlbums(page); await openAlbum(page); await selectReady(page, 1);
  const field = page.getByLabel('Legenda do momento 1', { exact: true }); await field.fill('🌷'.repeat(501));
  await page.getByRole('button', { name: 'Publicar 1 momentos prontos', exact: true }).click();
  await expect(field).toBeFocused(); await expect(field).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByRole('alert').filter({ hasText: 'Use até 500 caracteres Unicode válidos' })).toBeVisible();
  expect(state.bodies).toHaveLength(0);
  await field.fill('   '); await confirmPublish(page, 1); expect(state.bodies[0].items[0].caption).toBe('');
});

test('segundo lote é acrescentado ao fim sem editar publicação anterior', async ({ page }) => {
  const { state } = await mockAlbums(page); await openAlbum(page);
  await page.getByLabel('Legenda do momento 2', { exact: true }).fill('Rascunho preservado');
  await selectReady(page, 1); await confirmPublish(page, 1);
  await expect(page.getByRole('listitem', { name: /Momento publicado/ })).toHaveCount(1);
  await expect(page.getByLabel('Legenda do momento 1', { exact: true })).toHaveValue('Rascunho preservado');
  await selectReady(page, 1); await page.getByLabel('Legenda do momento 1', { exact: true }).fill('Segundo momento'); await confirmPublish(page, 1);
  await expect(page.getByRole('listitem', { name: /Momento publicado/ })).toHaveCount(2);
  expect(state.bodies).toHaveLength(2); expect(state.bodies[0].operationId).not.toBe(state.bodies[1].operationId);
  expect(state.album.items.map(value => value.position)).toEqual([1, 2]);
});

test('seleção explícita limita publicação a dez sem selecionar automaticamente', async ({ page }) => {
  const { state } = await mockAlbums(page, { assets: Array.from({ length: 11 }, (_, index) => asset(index + 1)) }); await openAlbum(page);
  await selectReady(page, 10);
  await expect(page.getByRole('checkbox', { name: 'Selecionar momento 11 para publicar', exact: true })).toBeDisabled();
  await confirmPublish(page, 10); await expect(page.getByRole('listitem', { name: /Momento publicado/ })).toHaveCount(10);
  expect(state.bodies[0].items).toHaveLength(10);
});

test('álbum ausente só é iniciado após ação e upload usa o transporte existente', async ({ page }) => {
  const { state } = await mockAlbums(page, { exists: false, assets: [] }); await openAlbum(page);
  expect(state.calls.some(value => value.endsWith('/iniciar'))).toBe(false);
  await page.getByRole('button', { name: 'Adicionar momentos', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Arquivos deste item', exact: true })).toBeVisible();
  const chooser = page.waitForEvent('filechooser'); await page.getByRole('button', { name: 'Escolher da galeria', exact: true }).click();
  await (await chooser).setFiles({ name: 'momento-local.png', mimeType: 'image/png', buffer: pixel });
  await expect(page.getByRole('img', { name: 'Prévia local de momento-local.png', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Enviar arquivos selecionados', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'Selecionar momento 1 para publicar', exact: true })).toBeVisible();
  await selectReady(page, 1); await confirmPublish(page, 1);
  await expect(page.getByRole('listitem', { name: /Momento publicado/ })).toHaveCount(1);
});
