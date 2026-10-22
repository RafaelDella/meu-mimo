import { expect } from '@playwright/test';
import type { AlbumPublicationBody } from '../../../src/contracts/albums';
import { test, mockAlbums, openAlbum, selectReady, confirmPublish, publish, api, json, ticketPath, albumId } from './helpers';

test('resposta perdida consulta intenção sem duplicar publicação', async ({ page }) => {
  let lost = false;
  const { state } = await mockAlbums(page, { handler: async (route, url, current) => {
    if (url.pathname === `${api}/publicacoes` && !lost) {
      lost = true; const body = route.request().postDataJSON() as AlbumPublicationBody; current.bodies.push(body); publish(current, body); await route.abort('failed'); return true;
    } return false;
  } });
  await openAlbum(page); await selectReady(page, 2); await page.getByLabel('Legenda do momento 1', { exact: true }).fill('Texto privado'); await confirmPublish(page, 2);
  await expect(page.getByRole('button', { name: 'Consultar resultado da publicação', exact: true })).toBeVisible();
  expect(page.url()).toContain('publicacao='); expect(page.url()).not.toContain('Texto');
  await page.getByRole('button', { name: 'Consultar resultado da publicação', exact: true }).click();
  await expect(page.getByRole('listitem', { name: /Momento publicado/ })).toHaveCount(2);
  expect(state.bodies).toHaveLength(1); expect(state.operations.size).toBe(1); expect(page.url()).not.toContain('publicacao=');
});

test('reload recupera UUID aplicada e avisa que textos de rascunho exigem revisão', async ({ page }) => {
  const { state } = await mockAlbums(page); const operationId = 'c1111111-1111-4111-8111-111111111111';
  publish(state, { operationId, expectedVersion: 1, items: [{ assetId: state.assets[0].id, caption: 'Confirmada antes do reload' }] });
  await page.goto(`${ticketPath}?publicacao=${operationId}`);
  await expect(page.getByRole('listitem', { name: 'Momento publicado 1', exact: true })).toContainText('Confirmada antes do reload');
  await expect(page.getByRole('status').filter({ hasText: 'Publicação da versão' })).toBeVisible();
  expect(state.bodies).toHaveLength(0); expect(page.url()).not.toContain('publicacao=');
  await expect(page.getByText('As legendas e a ordem ainda não publicadas ficam nesta tela.', { exact: false })).toBeVisible();
});

for (const status of [429, 503]) test(`${status} preserva legenda e exige lookup e revisão antes de nova intenção`, async ({ page }) => {
  let failed = false;
  const { state } = await mockAlbums(page, { handler: async (route, url, current) => {
    if (url.pathname === `${api}/publicacoes` && !failed) {
      failed = true; current.bodies.push(route.request().postDataJSON()); await json(route, { code: 'unavailable', message: 'Aguarde para consultar.' }, status); return true;
    } return false;
  } });
  await openAlbum(page); await selectReady(page, 1); await page.getByLabel('Legenda do momento 1', { exact: true }).fill('Legenda que fica'); await confirmPublish(page, 1);
  const firstId = state.bodies[0].operationId;
  await expect(page.getByLabel('Legenda do momento 1', { exact: true })).toHaveValue('Legenda que fica');
  await expect(page.getByRole('button', { name: 'Publicar 1 momentos prontos', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Consultar resultado da publicação', exact: true }).click();
  await page.getByRole('button', { name: 'Consultar álbum para nova revisão', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Publicar 1 momentos prontos', exact: true })).toBeEnabled();
  await expect(page.getByLabel('Legenda do momento 1', { exact: true })).toHaveValue('Legenda que fica'); await confirmPublish(page, 1);
  await expect(page.getByRole('listitem', { name: /Momento publicado/ })).toHaveCount(1);
  expect(state.bodies).toHaveLength(2); expect(state.bodies[1].operationId).not.toBe(firstId);
  expect(state.bodies[1].items[0].caption).toBe('Legenda que fica');
});

test('conflito 409 consulta a intenção e exige revisão de versão atual', async ({ page }) => {
  let conflict = false;
  const { state } = await mockAlbums(page, { handler: async (route, url, current) => {
    if (url.pathname === `${api}/publicacoes` && !conflict) {
      conflict = true; current.bodies.push(route.request().postDataJSON()); current.album.version += 1;
      await json(route, { code: 'album_changed', message: 'O álbum mudou. Revise.' }, 409); return true;
    } return false;
  } });
  await openAlbum(page); await selectReady(page, 1); await confirmPublish(page, 1);
  await expect(page.getByRole('button', { name: 'Consultar álbum para nova revisão', exact: true })).toBeVisible();
  expect(state.calls.some(value => value.includes('/album/operacoes/'))).toBe(true);
  await page.getByRole('button', { name: 'Consultar álbum para nova revisão', exact: true }).click(); await confirmPublish(page, 1);
  await expect(page.getByRole('listitem', { name: /Momento publicado/ })).toHaveCount(1); expect(state.bodies[1].expectedVersion).toBe(2);
});

test('aviso ao participante não consulta operação autoral do lojista', async ({ page }) => {
  const { state } = await mockAlbums(page, { merchant: false, published: 1 }); await page.goto(`${ticketPath}?publicacao=${albumId}`);
  await expect(page.getByRole('listitem', { name: 'Momento publicado 1', exact: true })).toBeVisible();
  expect(state.calls.some(value => value.includes('/album/operacoes/'))).toBe(false);
  await expect(page.getByRole('heading', { name: 'Mimos indisponíveis', exact: true })).toHaveCount(0);
});

test('reload sem publicação descarta legendas, ordem e seleção ainda locais', async ({ page }) => {
  const { state } = await mockAlbums(page); await openAlbum(page);
  await selectReady(page, 1); await page.getByLabel('Legenda do momento 1', { exact: true }).fill('Legenda ainda privada em memória');
  await page.getByRole('button', { name: 'Mover momento 1 depois', exact: true }).click(); await page.reload();
  await expect(page.getByLabel('Legenda do momento 1', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Legenda do momento 2', { exact: true })).toHaveValue('');
  await expect(page.getByRole('checkbox', { name: 'Selecionar momento 1 para publicar', exact: true })).not.toBeChecked();
  expect(state.bodies).toHaveLength(0); expect(page.url()).not.toContain('Legenda');
  expect(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))).not.toContain('Legenda ainda privada');
});
