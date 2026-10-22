'use client';

import { StoreRequestError } from '@/components/stores/store-api';
import type { MediaContext, MediaTransport } from './transport';

/** Revalidar todo o conjunto aberto evita misturar revisões ou acesso antigos. */
export async function loadMediaPages(transport: MediaTransport, context: MediaContext,
  signal: AbortSignal, requestedPages: number) {
  const first = await transport.list(context, signal, 1);
  const items = new Map(first.items.map(asset => [asset.id, asset]));
  const pages = Math.min(requestedPages, Math.max(1, Math.ceil(first.total / first.pageSize)));
  for (let page = 2; page <= pages; page += 1) {
    const next = await transport.list(context, signal, page);
    if (next.collection.id !== first.collection.id || next.collection.revision !== first.collection.revision ||
        next.collection.writable !== first.collection.writable || next.total !== first.total) {
      throw new StoreRequestError('media_changed', 409, 'Os arquivos mudaram durante a consulta. Atualize para carregar o histórico atual.');
    }
    for (const asset of next.items) items.set(asset.id, asset);
  }
  return { ...first, items: [...items.values()], page: pages };
}
