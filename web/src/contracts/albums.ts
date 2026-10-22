import type { MediaType } from './media';
import type { PageResult } from './stores';

export type AlbumPreview = { publishedCount: number; thumbnailAssetId: string | null };
export type AlbumItemView = {
  assetId: string; caption: string; position: number; publishedAt: string;
  mediaType: MediaType; width: number; height: number; durationMs: number | null;
  canRemove: boolean;
};
export type TicketAlbumPage = PageResult<AlbumItemView> & {
  id: string | null; storeId: string; ticketId: string; version: number;
  collectionId: string | null;
  permissions: { canStart: boolean; canUpload: boolean; canPublish: boolean };
  unavailableReason: 'CANCELLED' | 'RETENTION_EXPIRED' | null;
};
export type AlbumPublicationBody = {
  operationId: string; expectedVersion: number; items: { assetId: string; caption: string }[];
};
export type AlbumPublicationView = {
  id: string; version: number; createdAt: string; assetIds: string[];
};
export type AlbumPublicationMutation = {
  album: TicketAlbumPage; publication: AlbumPublicationView; appliedVersion: number;
};
export type AlbumPublicationLookup = { operation: AlbumPublicationMutation | null };
