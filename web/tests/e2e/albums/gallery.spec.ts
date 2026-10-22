import { expect } from '@playwright/test';
import { test, mockAlbums, openAlbum, json, pixel, asset, now } from './helpers';

test('participante vê dimensões, duração e instante publicado de cada momento', async ({ page }) => {
  await mockAlbums(page, { merchant: false, assets: [asset(1), asset(4)], published: 2 }); await openAlbum(page);
  const photo = page.getByRole('listitem', { name: 'Momento publicado 1', exact: true });
  const video = page.getByRole('listitem', { name: 'Momento publicado 2', exact: true });
  await expect(photo.getByText('640 × 480 px', { exact: true })).toBeVisible();
  await expect(video.getByText('640 × 480 px · 1 s', { exact: true })).toBeVisible();
  await expect(photo.locator('time')).toHaveAttribute('datetime', now);
  await expect(photo.locator('time')).toHaveText(/22\/10\/2026/);
});

test('foto em diálogo usa teclado, Escape e devolve foco ao item', async ({ page }) => {
  await mockAlbums(page, { merchant: false, published: 1 }); await openAlbum(page);
  const trigger = page.getByRole('button', { name: 'Abrir foto 1', exact: true }); await trigger.focus(); await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog'); await expect(dialog.getByRole('img', { name: 'Legenda privada 1', exact: true })).toBeVisible();
  const close = dialog.getByRole('button', { name: 'Fechar', exact: true }); await close.focus(); await page.keyboard.press('Tab'); await expect(close).toBeFocused();
  await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0); await expect(trigger).toBeFocused();
  await expect(page.getByRole('button', { name: /Remover momento/ })).toHaveCount(0);
});

test('vídeo usa player nativo sem autoplay e não é publicado por reprodução', async ({ page }) => {
  let release: (() => void) | undefined; const pending = new Promise<void>(resolve => { release = resolve; });
  const { state } = await mockAlbums(page, { merchant: false, assets: [asset(4)], published: 1, handler: async (route, url) => {
    if (!url.pathname.startsWith('/api/album-content/') || url.searchParams.get('variant') !== 'display') return false;
    await pending; await route.abort('aborted').catch(() => {}); return true;
  } });
  try {
    await openAlbum(page); await page.getByRole('button', { name: 'Abrir vídeo 1', exact: true }).click();
    const video = page.getByRole('dialog').locator('video'); await expect(video).toHaveAttribute('controls', ''); await expect(video).toHaveAttribute('preload', 'metadata');
    await expect(video).toHaveAttribute('playsinline', ''); await expect(video).not.toHaveAttribute('autoplay', '');
    expect(state.bodies).toHaveLength(0); await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(0);
  } finally { release!(); }
});

test('410 no conteúdo permite renovar leitura mantendo momento e publicação', async ({ page }) => {
  let expired = true; let attempts = 0;
  const { state } = await mockAlbums(page, { merchant: false, published: 1, handler: async (route, url) => {
    if (!url.pathname.startsWith('/api/album-content/') || url.searchParams.get('variant') !== 'display') return false;
    attempts += 1;
    if (expired) { await json(route, { code: 'media_expired', message: 'Expirou.' }, 410); return true; }
    await route.fulfill({ status: 200, contentType: 'image/png', body: pixel }); return true;
  } });
  await openAlbum(page); await page.getByRole('button', { name: 'Abrir foto 1', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Leitura temporária expirada');
  await expect(page.getByRole('heading', { name: 'Mimos indisponíveis', exact: true })).toHaveCount(0);
  expired = false; await page.getByRole('button', { name: 'Renovar acesso ao momento', exact: true }).click();
  const image = page.getByRole('dialog').getByRole('img');
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate(value => value instanceof HTMLImageElement && value.complete && value.naturalWidth > 0)).toBe(true);
  expect(attempts).toBeGreaterThanOrEqual(3);
  expect(state.bodies).toHaveLength(0); expect(state.album.total).toBe(1);
});

test('410 na autorização de leitura permite nova autorização explícita', async ({ page }) => {
  let expired = true;
  await mockAlbums(page, { merchant: false, published: 1, handler: async (route, url) => {
    if (!url.pathname.endsWith('/acesso') || route.request().postDataJSON().variant !== 'display' || !expired) return false;
    await json(route, { code: 'media_expired', message: 'O acesso temporário expirou. Renove para continuar.' }, 410); return true;
  } });
  await openAlbum(page); await page.getByRole('button', { name: 'Abrir foto 1', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Renovar acesso ao momento', exact: true })).toBeVisible(); expired = false;
  await page.getByRole('button', { name: 'Renovar acesso ao momento', exact: true }).click(); await expect(page.getByRole('dialog').getByRole('img')).toBeVisible();
});

test('cancelado conserva remoção autoral sem oferecer upload nem publicação', async ({ page }) => {
  const { state } = await mockAlbums(page, { cancelled: true, published: 1 }); await openAlbum(page);
  await expect(page.getByText('Ticket cancelado: os momentos existentes continuam', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Escolher da galeria', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Publicar \d+ momentos/ })).toHaveCount(0);
  const remove = page.getByRole('button', { name: 'Remover momento 1', exact: true }); await remove.click(); await page.keyboard.press('Escape');
  await expect(remove).toBeFocused(); expect(state.album.total).toBe(1);
  await remove.click(); await page.getByRole('button', { name: 'Confirmar remoção do momento', exact: true }).click();
  await expect(page.getByRole('listitem', { name: /Momento publicado/ })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Álbum do ticket', exact: true })).toBeFocused(); expect(state.album.total).toBe(0);
});

test('remoção pelo uploader recarrega versão, galeria e capacidade', async ({ page }) => {
  const { state } = await mockAlbums(page, { published: 1 }); await openAlbum(page);
  const chooser = page.waitForEvent('filechooser'); await page.getByRole('button', { name: 'Escolher da galeria', exact: true }).click();
  await (await chooser).setFiles({ name: 'outro-rascunho-local.png', mimeType: 'image/png', buffer: pixel });
  const uploaded = page.getByRole('list', { name: 'Arquivos selecionados e enviados', exact: true }).getByRole('listitem', { name: 'Foto enviada', exact: true }).first();
  await uploaded.getByRole('button', { name: 'Remover arquivo', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Confirmar remoção', exact: true }).click();
  await expect(page.getByRole('listitem', { name: /Momento publicado/ })).toHaveCount(0);
  await expect(page.getByText('5 itens ocupam o álbum, incluindo publicados, falhas e envios em andamento.', { exact: true })).toBeVisible();
  await expect(page.getByRole('listitem', { name: 'outro-rascunho-local.png', exact: true })).toBeVisible();
  expect(state.album.version).toBe(3);
});
