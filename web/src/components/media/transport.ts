'use client';

import type { MediaAccess, MediaAssetView, MediaFileInput, MediaPage, MediaVariant } from '@/contracts/media';
import { StoreRequestError, storeRequest } from '@/components/stores/store-api';

export type MediaContext = { storeId: string; collectionId: string };
export type MediaTransport = {
  list(context: MediaContext, signal: AbortSignal): Promise<MediaPage>;
  reserve(context: MediaContext, files: MediaFileInput[], signal: AbortSignal): Promise<{ items: MediaAssetView[] }>;
  get(context: MediaContext, assetId: string, signal: AbortSignal): Promise<MediaAssetView>;
  part(context: MediaContext, assetId: string, offset: number, bytes: Blob, signal: AbortSignal): Promise<MediaAssetView>;
  complete(context: MediaContext, assetId: string, signal: AbortSignal): Promise<MediaAssetView>;
  remove(context: MediaContext, assetId: string, signal: AbortSignal): Promise<MediaAssetView>;
  access(context: MediaContext, assetId: string, variant: MediaVariant, signal: AbortSignal): Promise<MediaAccess>;
};

function base(context: MediaContext) { return `/api/lojas/${encodeURIComponent(context.storeId)}/midia`; }
function asset(context: MediaContext, id: string) { return `${base(context)}/arquivos/${encodeURIComponent(id)}`; }

export const mediaTransport: MediaTransport = {
  list: (context, signal) => storeRequest(`${base(context)}/${encodeURIComponent(context.collectionId)}?pageSize=50`, 'GET', undefined, signal),
  reserve: (context, files, signal) => storeRequest(`${base(context)}/${encodeURIComponent(context.collectionId)}`, 'POST', { files }, signal),
  get: (context, id, signal) => storeRequest(asset(context, id), 'GET', undefined, signal),
  complete: (context, id, signal) => storeRequest(`${asset(context, id)}/concluir`, 'POST', {}, signal),
  remove: (context, id, signal) => storeRequest(`${asset(context, id)}/remover`, 'POST', {}, signal),
  access: (context, id, variant, signal) => storeRequest(`${asset(context, id)}/acesso`, 'POST', { variant }, signal),
  async part(context, id, offset, bytes, signal) {
    const response = await fetch(`${asset(context, id)}/partes?offset=${offset}`, {
      method: 'PUT', body: bytes, signal, credentials: 'same-origin', cache: 'no-store',
      headers: { 'Content-Type': 'application/octet-stream' },
    });
    const value = await response.json();
    if (!response.ok) throw new StoreRequestError(value.code ?? 'request_failed', response.status,
      typeof value.message === 'string' ? value.message : 'Não foi possível confirmar esta parte do arquivo.');
    return value as MediaAssetView;
  },
};
