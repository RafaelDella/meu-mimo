'use client';

import type { MediaAssetView, MediaFileInput } from '@/contracts/media';
import { StoreRequestError } from '@/components/stores/store-api';
import type { MediaContext, MediaTransport } from './transport';

export const PART_BYTES = 5 * 1024 * 1024;
export type UploadItem = {
  id: string; name: string; file?: File; input?: MediaFileInput; asset?: MediaAssetView;
  attempted: boolean; phase: 'selected' | 'hashing' | 'sending' | 'waiting' | 'done' | 'error';
  error?: string; invalid?: boolean;
};
export type ItemPatch = Partial<UploadItem>;
const photoTypes = ['image/jpeg', 'image/png', 'image/webp'];
const videoTypes = ['video/mp4', 'video/quicktime'];

export function fileError(file: File, evidence: boolean) {
  if (!photoTypes.includes(file.type) && !(videoTypes.includes(file.type) && !evidence)) {
    return evidence ? 'Escolha uma foto JPEG, PNG ou WebP. HEIC não é aceito nesta etapa.' :
      'Use JPEG, PNG, WebP, MP4 ou MOV. HEIC não é aceito nesta etapa.';
  }
  const maximum = photoTypes.includes(file.type) ? 10_000_000 : 100_000_000;
  return file.size > maximum || file.size < 1 ? `Use um arquivo com conteúdo de até ${maximum / 1_000_000} MB.` : '';
}

export async function checksum(file: Blob, signal: AbortSignal): Promise<string> {
  signal.throwIfAborted();
  const hash = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  signal.throwIfAborted();
  return [...new Uint8Array(hash)].map(value => value.toString(16).padStart(2, '0')).join('');
}

export function fromAsset(asset: MediaAssetView): UploadItem {
  return { id: asset.id, name: asset.mediaType === 'PHOTO' ? 'Foto enviada' : 'Vídeo enviado',
    asset, attempted: true, phase: asset.state === 'READY' ? 'done' : asset.state === 'UPLOADING' ? 'selected' : 'waiting' };
}

function verifyAsset(asset: MediaAssetView, item: UploadItem, context: MediaContext) {
  if (asset.id !== item.id || asset.collectionId !== context.collectionId ||
      asset.byteLength !== item.file?.size || asset.mimeType !== item.file?.type ||
      !Number.isSafeInteger(asset.uploadedBytes) || asset.uploadedBytes < 0 || asset.uploadedBytes > asset.byteLength) {
    throw new Error('O progresso deste arquivo não pôde ser confirmado.');
  }
}

// Cada retomada consulta a autorização e o offset confirmado. O replay da
// reserva confere o checksum do arquivo escolhido sem expô-lo no DTO de leitura.
export async function uploadItem(context: MediaContext, item: UploadItem, transport: MediaTransport,
  signal: AbortSignal, update: (patch: ItemPatch) => void): Promise<MediaAssetView> {
  if (!item.file) throw new Error('Selecione novamente o arquivo original para retomar.');
  update({ phase: 'hashing', error: undefined });
  const input = item.input ?? { operationId: item.id, mediaType: item.file.type.startsWith('image/') ? 'PHOTO' : 'VIDEO',
    mimeType: item.file.type, byteLength: item.file.size, sha256: await checksum(item.file, signal) } satisfies MediaFileInput;
  update({ input });
  let current = item.asset;
  if (item.attempted) {
    try { current = await transport.get(context, item.id, signal); }
    catch (cause) {
      if (item.asset || !(cause instanceof StoreRequestError && cause.status === 404)) throw cause;
    }
  }
  signal.throwIfAborted();
  if (current) verifyAsset(current, item, context);
  update({ attempted: true, phase: 'sending' });
  current = (await transport.reserve(context, [input], signal)).items[0];
  signal.throwIfAborted();
  verifyAsset(current, item, context);
  update({ asset: current, phase: 'sending' });
  if (current.state === 'READY' || current.state === 'QUEUED' || current.state === 'PROCESSING') return current;
  if (current.state !== 'UPLOADING' && current.state !== 'FAILED') throw new StoreRequestError('media_read_only', 409, 'Este arquivo não aceita novos envios.');
  while (current.uploadedBytes < current.byteLength) {
    const offset = current.uploadedBytes;
    const bytes = item.file.slice(offset, Math.min(offset + PART_BYTES, item.file.size));
    const next = await transport.part(context, item.id, offset, bytes, signal);
    signal.throwIfAborted();
    verifyAsset(next, item, context);
    if (next.uploadedBytes <= offset) throw new Error('O servidor não confirmou avanço no envio.');
    current = next;
    update({ asset: current });
  }
  signal.throwIfAborted();
  return transport.complete(context, item.id, signal);
}
