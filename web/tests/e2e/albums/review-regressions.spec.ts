import { expect } from '@playwright/test';
import { test, mockAlbums, openAlbum, api, json } from './helpers';

test('rascunho pronto conserva miniatura e duração na revisão depois de recarregar', async ({ page }) => {
  await mockAlbums(page); await openAlbum(page); await page.reload();
  const video = page.getByRole('listitem', { name: 'Rascunho pronto 4', exact: true });
  await expect(video.getByRole('img')).toBeVisible();
  await expect(video.getByText('1 s', { exact: true })).toBeVisible();
});

for (const source of ['galeria', 'uploader']) test(`remoção confirmada na ${source} oculta momento mesmo se atualizar álbum falhar`, async ({ page }) => {
  let removed = false;
  await mockAlbums(page, { published: 1, handler: async (route, url) => {
    if (url.pathname.endsWith('/remover') && route.request().method() === 'POST') removed = true;
    if (url.pathname === api && removed && route.request().method() === 'GET') {
      await json(route, { code: 'service_unavailable', message: 'Falha sintética da consulta' }, 503); return true;
    }
    return false;
  } });
  await openAlbum(page);
  if (source === 'galeria') {
    await page.getByRole('button', { name: 'Remover momento 1', exact: true }).click();
    await page.getByRole('button', { name: 'Confirmar remoção do momento', exact: true }).click();
  } else {
    await page.getByRole('list', { name: 'Arquivos selecionados e enviados', exact: true })
      .getByRole('listitem', { name: 'Foto enviada', exact: true }).first().getByRole('button', { name: 'Remover arquivo', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Confirmar remoção', exact: true }).click();
  }
  await expect(page.getByRole('listitem', { name: 'Momento publicado 1', exact: true })).toHaveCount(0);
  await expect(page.getByText('Ainda não há momentos publicados neste álbum.', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Mimos indisponíveis', exact: true })).toHaveCount(0);
});
