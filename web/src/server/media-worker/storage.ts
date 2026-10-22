import '../only.ts';
import { createClient } from '@supabase/supabase-js';
import type { MediaType, MediaVariant } from '../../contracts/media.ts';
import { AppError } from '../errors.ts';
import { mediaWorkerConfig } from './config.ts';

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

function assetPrefix(assetId: string): string {
  if (!uuid.test(assetId)) throw new AppError('field_invalid', 400, 'Arquivo inválido.');
  return `${mediaWorkerConfig().prefix}/${assetId.toLowerCase()}`;
}

function assertObjectKey(key: string): void {
  const prefix = mediaWorkerConfig().prefix;
  const pieces = key.split('/');
  if (pieces[0] !== prefix || !uuid.test(pieces[1] ?? '') || pieces.length < 3 ||
      pieces.some(piece => !piece || !/^[a-zA-Z0-9._-]+$/.test(piece) || piece === '.' || piece === '..')) {
    throw new AppError('field_invalid', 400, 'Objeto de mídia inválido.');
  }
}

function bucket() {
  const config = mediaWorkerConfig();
  return createClient(config.url, config.key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }).storage.from(config.bucket);
}

function storageUnavailable(): never {
  throw new AppError('media_storage_unavailable', 503, 'O armazenamento de mídia não está disponível agora.');
}

export function partKey(assetId: string, offset: number, sha256: string): string {
  if (!Number.isSafeInteger(offset) || offset < 0 || !/^[a-f0-9]{64}$/.test(sha256)) {
    throw new AppError('field_invalid', 400, 'Parte de arquivo inválida.');
  }
  return `${assetPrefix(assetId)}/parts/${offset}-${sha256}`;
}

export function outputKey(assetId: string, version: string, variant: MediaVariant, mediaType: MediaType): string {
  if (!uuid.test(version) || !['display', 'thumbnail'].includes(variant) || !['PHOTO', 'VIDEO'].includes(mediaType)) {
    throw new AppError('field_invalid', 400, 'Variante inválida.');
  }
  const name = variant === 'thumbnail' ? 'thumbnail.jpg' : mediaType === 'VIDEO' ? 'display.mp4' : 'display.jpg';
  return `${assetPrefix(assetId)}/${version}/${name}`;
}

export async function putObject(key: string, bytes: Uint8Array, contentType: string): Promise<void> {
  assertObjectKey(key);
  const result = await bucket().upload(key, bytes, { contentType, upsert: true, cacheControl: '0' });
  if (result.error) storageUnavailable();
}

export async function objectResponse(key: string, range?: { start: number; end: number }): Promise<Response> {
  assertObjectKey(key);
  const config = mediaWorkerConfig();
  const headers: Record<string, string> = { Authorization: `Bearer ${config.key}`, apikey: config.key };
  if (range) headers.Range = `bytes=${range.start}-${range.end}`;
  let response;
  try {
    response = await fetch(`${config.url}/storage/v1/object/authenticated/${config.bucket}/${key}`, {
      headers, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(30_000),
    });
  } catch { return storageUnavailable(); }
  if (!response.ok || !response.body) return storageUnavailable();
  return response;
}

export async function readObject(key: string, maxBytes: number): Promise<Buffer> {
  const response = await objectResponse(key);
  const reader = response.body!.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  for (;;) {
    const result = await reader.read();
    if (result.done) break;
    length += result.value.length;
    if (length > maxBytes) {
      await reader.cancel();
      return storageUnavailable();
    }
    chunks.push(result.value);
  }
  return Buffer.concat(chunks);
}

export async function deleteObjects(keys: string[]): Promise<void> {
  keys.forEach(assertObjectKey);
  for (let offset = 0; offset < keys.length; offset += 100) {
    const result = await bucket().remove(keys.slice(offset, offset + 100));
    if (result.error) storageUnavailable();
  }
}

export async function listAssetObjects(assetId: string): Promise<string[]> {
  const found: string[] = [];
  const pending = [assetPrefix(assetId)];
  while (pending.length) {
    const directory = pending.shift()!;
    for (let offset = 0; ; offset += 100) {
      const result = await bucket().list(directory, { limit: 100, offset, sortBy: { column: 'name', order: 'asc' } });
      if (result.error || !result.data) storageUnavailable();
      for (const item of result.data) {
        const key = `${directory}/${item.name}`;
        assertObjectKey(key);
        if (item.id) found.push(key); else pending.push(key);
      }
      if (result.data.length < 100) break;
    }
    if (pending.length + found.length > 10_000) storageUnavailable();
  }
  return found;
}
