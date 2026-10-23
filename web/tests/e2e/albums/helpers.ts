import type { Page, Route } from '@playwright/test';
import type { AlbumPublicationBody, AlbumPublicationMutation, TicketAlbumPage } from '../../../src/contracts/albums';
import type { MediaAssetView, MediaFileInput } from '../../../src/contracts/media';
import { mockTickets, now, ticketId, ticketPath } from '../tickets/helpers';
import { ids, json } from '../stores/helpers';

export { test, noOverflow, actionsFit } from '../stores/helpers';
export { now, ticketId, ticketPath } from '../tickets/helpers';
export { json, ids } from '../stores/helpers';
export const collectionId = 'a1111111-1111-4111-8111-111111111111';
export const albumId = 'a2222222-2222-4222-8222-222222222222';
export const api = `/api/lojas/${ids.first}/tickets/${ticketId}/album`;
export const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
export function asset(index = 1, overrides: Partial<MediaAssetView> = {}): MediaAssetView {
  return { id: `b1111111-1111-4111-8111-${String(index).padStart(12, '0')}`, collectionId, revision: 1, mediaType: index > 3 ? 'VIDEO' : 'PHOTO',
    mimeType: index > 3 ? 'video/mp4' : 'image/png', byteLength: pixel.length, uploadedBytes: pixel.length, state: 'READY', createdAt: now,
    publishedAt: null, width: 640, height: 480, durationMs: index > 3 ? 1000 : null, failureCode: null, ...overrides };
}
export type AlbumMock = {
  album: TicketAlbumPage; assets: MediaAssetView[]; operations: Map<string, AlbumPublicationMutation>;
  bodies: AlbumPublicationBody[]; calls: string[]; merchant: boolean; grants: number;
};
type Handler = (route: Route, url: URL, state: AlbumMock) => Promise<boolean>;
export function publish(state: AlbumMock, body: AlbumPublicationBody) {
  const existing = state.operations.get(body.operationId); if (existing) return { ...existing, album: state.album };
  const position = Math.max(0, ...state.album.items.map(value => value.position)) + 1;
  state.album.version += 1;
  for (const [index, selected] of body.items.entries()) {
    const value = state.assets.find(item => item.id === selected.assetId)!; value.publishedAt = now;
    state.album.items.push({ assetId: value.id, caption: selected.caption, position: position + index, publishedAt: now,
      mediaType: value.mediaType, width: value.width!, height: value.height!, durationMs: value.durationMs, canRemove: state.merchant });
  }
  state.album.total = state.album.items.length;
  const result = { album: state.album, publication: { id: body.operationId, version: state.album.version, createdAt: now, assetIds: body.items.map(value => value.assetId) }, appliedVersion: state.album.version };
  state.operations.set(body.operationId, result); return result;
}
// Respostas controladas verificam UI; HTTP separado prova banco, Storage e bytes.
export async function mockAlbums(page: Page, options: { merchant?: boolean; exists?: boolean; cancelled?: boolean; published?: number; assets?: MediaAssetView[]; handler?: Handler } = {}) {
  const merchant = options.merchant ?? true; const exists = options.exists ?? true;
  const state: AlbumMock = { merchant, assets: options.assets ?? [asset(1), asset(2), asset(3), asset(4), asset(5, { state: 'FAILED', failureCode: 'file_invalid' })],
    operations: new Map(), bodies: [], calls: [], grants: 0,
    album: { id: exists ? albumId : null, storeId: ids.first, ticketId, version: exists ? 1 : 0,
      collectionId: exists && merchant ? collectionId : null, permissions: { canStart: merchant && !exists && !options.cancelled, canUpload: merchant && exists && !options.cancelled, canPublish: merchant && exists && !options.cancelled },
      unavailableReason: options.cancelled ? 'CANCELLED' : null, items: [], page: 1, pageSize: 20, total: 0 } };
  if (options.published) publish(state, { operationId: albumId, expectedVersion: state.album.version, items: state.assets.slice(0, options.published).map((value, index) => ({ assetId: value.id, caption: `Legenda privada ${index + 1}` })) });
  const tickets = await mockTickets(page, { merchant, status: options.cancelled ? 'CANCELLED' : undefined, handler: async (route, url) => {
    state.calls.push(`${route.request().method()} ${url.pathname}`);
    if (options.handler && await options.handler(route, url, state)) return true;
    const path = url.pathname;
    if (path === api) { await json(route, state.album); return true; }
    if (path === `${api}/iniciar`) {
      state.album.id = albumId; state.album.version = 1; state.album.collectionId = collectionId;
      state.album.permissions = { canStart: false, canUpload: true, canPublish: true }; await json(route, { album: state.album }, 201); return true;
    }
    if (path === `${api}/publicacoes`) {
      const body = route.request().postDataJSON() as AlbumPublicationBody; state.bodies.push(body); await json(route, publish(state, body)); return true;
    }
    if (path.startsWith(`${api}/operacoes/`)) {
      const result = state.operations.get(path.split('/').pop()!); await json(route, { operation: result ? { ...result, album: state.album } : null }); return true;
    }
    if (path === `/api/lojas/${ids.first}/midia/${collectionId}`) {
      if (route.request().method() === 'POST') {
        const files = route.request().postDataJSON().files as MediaFileInput[];
        const items = files.map(file => asset(1, { id: file.operationId, mediaType: file.mediaType, mimeType: file.mimeType, byteLength: file.byteLength, uploadedBytes: 0, state: 'UPLOADING' }));
        state.assets.push(...items); await json(route, { items }); return true;
      }
      await json(route, { collection: { id: collectionId, storeId: ids.first, purpose: 'MEMORY', revision: 1, writable: state.album.permissions.canUpload }, items: state.assets, page: 1, pageSize: 50, total: state.assets.length }); return true;
    }
    if (path.startsWith(`/api/lojas/${ids.first}/midia/arquivos/`)) {
      const id = path.split('/')[6]; const value = state.assets.find(item => item.id === id);
      if (!value) { await json(route, { code: 'resource_not_found', message: 'Arquivo indisponível.' }, 404); return true; }
      if (path.endsWith('/acesso')) {
        state.grants += 1; await json(route, { url: `/api/album-content/${value.id}?grant=${state.grants}&variant=${route.request().postDataJSON().variant}`, expiresAt: new Date(Date.now() + 300_000).toISOString() }); return true;
      }
      if (path.endsWith('/remover')) {
        state.assets = state.assets.filter(item => item.id !== id); state.album.items = state.album.items.filter(item => item.assetId !== id);
        state.album.total = state.album.items.length; state.album.version += 1; await json(route, { ...value, state: 'REMOVING' }); return true;
      }
      if (path.endsWith('/partes')) value.uploadedBytes += route.request().postDataBuffer()?.length ?? 0;
      if (path.endsWith('/concluir')) value.state = 'READY';
      await json(route, value); return true;
    }
    if (path.startsWith('/api/album-content/')) { await route.fulfill({ status: 200, contentType: 'image/png', body: pixel }); return true; }
    return false;
  } });
  tickets.state.current.album = { publishedCount: state.album.total, thumbnailAssetId: state.album.items[0]?.assetId ?? null };
  return { state, ticketState: tickets.state, auth: tickets.auth };
}
export async function openAlbum(page: Page) {
  await page.goto(ticketPath); await page.getByRole('heading', { name: 'Álbum do ticket', exact: true }).waitFor();
}
export async function selectReady(page: Page, count = 4) {
  for (let index = 1; index <= count; index += 1) await page.getByRole('checkbox', { name: `Selecionar momento ${index} para publicar`, exact: true }).check();
}
export async function confirmPublish(page: Page, count = 4) {
  await page.getByRole('button', { name: `Publicar ${count} momentos prontos`, exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Confirmar publicação', exact: true }).click();
}
