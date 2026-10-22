export type MediaPurpose = 'EVIDENCE' | 'MEMORY';
export type MediaType = 'PHOTO' | 'VIDEO';
export type MediaState = 'UPLOADING' | 'QUEUED' | 'PROCESSING' | 'READY' | 'FAILED' | 'REMOVING' | 'REMOVED';
export type MediaVariant = 'display' | 'thumbnail';
export type MediaFileInput = {
  operationId: string; mediaType: MediaType; mimeType: string; byteLength: number; sha256: string;
};
export type MediaAssetView = {
  id: string; collectionId: string; revision: number; mediaType: MediaType; mimeType: string;
  byteLength: number; uploadedBytes: number; state: MediaState; createdAt: string;
  publishedAt: string | null; width: number | null; height: number | null;
  durationMs: number | null; failureCode: string | null;
};
export type MediaPage = {
  collection: { id: string; storeId: string; purpose: MediaPurpose; revision: number; writable: boolean };
  items: MediaAssetView[]; page: number; pageSize: number; total: number;
};
export type MediaAccess = { url: string; expiresAt: string };
