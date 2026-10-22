'use client';

import type { AlbumPublicationBody, AlbumPublicationLookup, AlbumPublicationMutation, TicketAlbumPage } from '@/contracts/albums';
import { storeRequest } from '@/components/stores/store-api';

export function albumBase(storeId: string, ticketId: string) {
  return `/api/lojas/${encodeURIComponent(storeId)}/tickets/${encodeURIComponent(ticketId)}/album`;
}
export const albumApi = {
  read: (base: string, signal: AbortSignal) => storeRequest<TicketAlbumPage>(base, 'GET', undefined, signal),
  start: (base: string, operationId: string, signal: AbortSignal) => storeRequest<{ album: TicketAlbumPage }>(`${base}/iniciar`, 'POST', { operationId }, signal),
  publish: (base: string, body: AlbumPublicationBody, signal: AbortSignal) => storeRequest<AlbumPublicationMutation>(`${base}/publicacoes`, 'POST', body, signal),
  lookup: (base: string, id: string, signal: AbortSignal) => storeRequest<AlbumPublicationLookup>(`${base}/operacoes/${encodeURIComponent(id)}`, 'GET', undefined, signal),
};
