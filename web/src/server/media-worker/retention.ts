import '../only.ts';
import { randomUUID } from 'node:crypto';
import { getDb } from '../db/client.ts';
import { AppError } from '../errors.ts';
import { databaseNow } from '../stores/transaction.ts';
import { purgeRemovedMediaBatch } from './cleanup.ts';
import { deleteObjects, listAssetObjects } from './storage.ts';
import { purgeTemporaryMediaBatch } from './temporary.ts';

function batchLimit(value = 20): number {
  if (!Number.isInteger(value) || value < 1 || value > 50) throw new AppError('field_invalid', 400, 'Lote de limpeza inválido.');
  return value;
}

/** Ocultar primeiro. Proteção da origem e atividade são revalidadas sob os mesmos locks do upload. */
export async function expireMediaBatch(options: { limit?: number; signal?: AbortSignal } = {}): Promise<{ orphaned: number; expired: number }> {
  const result = { orphaned: 0, expired: 0 };
  for (let index = 0, limit = batchLimit(options.limit); index < limit; index++) {
    if (options.signal?.aborted) break;
    const kind = await getDb().$transaction(async tx => {
      if (options.signal?.aborted) return null;
      // A manutenção concorre com publicação/encerramento sem inverter Store→coleção→asset.
      const stores = await tx.$queryRaw<{ id: string }[]>`
        SELECT s.id FROM app."Store" s WHERE EXISTS (
          SELECT 1 FROM app."MediaCollection" c JOIN app."MediaAsset" a ON a."collectionId"=c.id
          WHERE c."storeId"=s.id AND a."removedAt" IS NULL
          AND (a."leaseUntil" IS NULL OR a."leaseUntil" <= clock_timestamp()) AND (
            (a."publishedAt" IS NULL AND a."lastActivityAt" <= clock_timestamp()-interval '24 hours') OR
            (a."publishedAt" IS NOT NULL AND NOT c."retentionHold" AND (
              (c.purpose='EVIDENCE' AND a."publishedAt" <= clock_timestamp()-interval '180 days') OR
              (c.purpose='MEMORY' AND c."retentionUntil" <= clock_timestamp())))))
        ORDER BY s.id FOR UPDATE OF s SKIP LOCKED LIMIT 1`;
      if (!stores.length || options.signal?.aborted) return null;
      const collections = await tx.$queryRaw<{ id: string }[]>`
        SELECT c.id FROM app."MediaCollection" c WHERE c."storeId"=${stores[0].id}::uuid AND EXISTS (
          SELECT 1 FROM app."MediaAsset" a WHERE a."collectionId"=c.id AND a."removedAt" IS NULL
          AND (a."leaseUntil" IS NULL OR a."leaseUntil" <= clock_timestamp()) AND (
            (a."publishedAt" IS NULL AND a."lastActivityAt" <= clock_timestamp()-interval '24 hours') OR
            (a."publishedAt" IS NOT NULL AND NOT c."retentionHold" AND (
              (c.purpose='EVIDENCE' AND a."publishedAt" <= clock_timestamp()-interval '180 days') OR
              (c.purpose='MEMORY' AND c."retentionUntil" <= clock_timestamp())))))
        ORDER BY c.id FOR UPDATE OF c SKIP LOCKED LIMIT 1`;
      if (!collections.length || options.signal?.aborted) return null;
      const collection = await tx.mediaCollection.findUniqueOrThrow({ where: { id: collections[0].id } });
      if (options.signal?.aborted) return null;
      const now = await databaseNow(tx);
      if (options.signal?.aborted) return null;
      const assets = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM app."MediaAsset" WHERE "collectionId"=${collection.id}::uuid AND "removedAt" IS NULL
        AND ("leaseUntil" IS NULL OR "leaseUntil" <= ${now}) AND (
          ("publishedAt" IS NULL AND "lastActivityAt" <= ${new Date(now.getTime() - 86_400_000)}) OR
          ("publishedAt" IS NOT NULL AND ${!collection.retentionHold} AND (
            (${collection.purpose === 'EVIDENCE'} AND "publishedAt" <= ${new Date(now.getTime() - 180 * 86_400_000)}) OR
            (${collection.purpose === 'MEMORY'} AND ${collection.retentionUntil}::timestamptz <= ${now}))))
        ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1`;
      if (!assets.length || options.signal?.aborted) return null;
      const asset = await tx.mediaAsset.findUniqueOrThrow({ where: { id: assets[0].id } });
      if (options.signal?.aborted) return null;
      await tx.mediaAsset.update({ where: { id: asset.id }, data: {
        state: 'REMOVING', removedAt: now, availableAt: now, leaseToken: null,
        // Conservar leaseUntil para a quarentena de gravações antigas no expurgo.
      } });
      return asset.publishedAt ? 'expired' as const : 'orphaned' as const;
    });
    if (!kind) break;
    result[kind] += 1;
  }
  return result;
}

/** READY já tem ambos os derivados confirmados; o original não é necessário para consulta. */
export async function purgeOriginalMediaBatch(options: { limit?: number; signal?: AbortSignal } = {}): Promise<{ purged: number; failed: number }> {
  const result = { purged: 0, failed: 0 };
  for (let index = 0, limit = batchLimit(options.limit); index < limit; index++) {
    if (options.signal?.aborted) break;
    const job = await getDb().$transaction(async tx => {
      if (options.signal?.aborted) return null;
      const rows = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM app."MediaAsset" WHERE state='READY' AND "removedAt" IS NULL
        AND "processedAt" IS NOT NULL AND "availableAt" <= clock_timestamp()
        AND ("leaseUntil" IS NULL OR "leaseUntil" < clock_timestamp()-interval '2 minutes')
        ORDER BY "availableAt", id FOR UPDATE SKIP LOCKED LIMIT 1`;
      if (!rows.length || options.signal?.aborted) return null;
      const token = randomUUID();
      const now = await databaseNow(tx);
      if (options.signal?.aborted) return null;
      await tx.mediaAsset.update({ where: { id: rows[0].id }, data: {
        leaseToken: token, leaseUntil: new Date(now.getTime() + 300_000),
      } });
      return { id: rows[0].id, token };
    });
    if (!job) break;
    try {
      const parts = (await listAssetObjects(job.id)).filter(key => key.includes('/parts/'));
      await deleteObjects(parts);
      if ((await listAssetObjects(job.id)).some(key => key.includes('/parts/'))) throw new Error('Original pendente.');
      await getDb().$transaction(async tx => {
        const now = await databaseNow(tx);
        await tx.$queryRaw`SELECT id FROM app."MediaAsset" WHERE id=${job.id}::uuid FOR UPDATE`;
        const asset = await tx.mediaAsset.findFirst({ where: { id: job.id, state: 'READY', removedAt: null, leaseToken: job.token } });
        if (!asset) return;
        const removed = await tx.mediaPart.deleteMany({ where: { assetId: job.id } });
        await tx.mediaAsset.update({ where: { id: job.id }, data: {
          leaseToken: null, leaseUntil: null, availableAt: new Date(now.getTime() + 3_600_000),
        } });
        if (parts.length || removed.count) result.purged += 1;
      });
    } catch {
      result.failed += 1;
      await getDb().$transaction(async tx => {
        const now = await databaseNow(tx);
        await tx.mediaAsset.updateMany({ where: { id: job.id, state: 'READY', removedAt: null, leaseToken: job.token }, data: {
          leaseToken: null, leaseUntil: null, availableAt: new Date(now.getTime() + 30_000),
        } });
      });
    }
  }
  return result;
}

export async function cleanupMediaBatch(options: { signal?: AbortSignal } = {}): Promise<{
  orphaned: number; expired: number; originalsPurged: number; temporaryPurged: number; purged: number; failed: number;
}> {
  const expired = options.signal?.aborted ? { orphaned: 0, expired: 0 } : await expireMediaBatch(options);
  const originals = options.signal?.aborted ? { purged: 0, failed: 0 } : await purgeOriginalMediaBatch(options);
  const removed = options.signal?.aborted ? { purged: 0, failed: 0 } : await purgeRemovedMediaBatch(options);
  const temporary = options.signal?.aborted ? { purged: 0, failed: 0 } : await purgeTemporaryMediaBatch(options);
  return { ...expired, originalsPurged: originals.purged, temporaryPurged: temporary.purged,
    ...removed, failed: originals.failed + removed.failed + temporary.failed };
}
