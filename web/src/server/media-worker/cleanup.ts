import '../only.ts';
import { randomUUID } from 'node:crypto';
import { getDb } from '../db/client.ts';
import { AppError } from '../errors.ts';
import { databaseNow } from '../stores/transaction.ts';
import { deleteObjects, listAssetObjects } from './storage.ts';

/** Expurgo de remoções explícitas ou já marcadas pela política D08. */
export async function purgeRemovedMediaBatch(options: { limit?: number; signal?: AbortSignal } = {}): Promise<{ purged: number; failed: number }> {
  const limit = options.limit ?? 20;
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new AppError('field_invalid', 400, 'Lote de limpeza inválido.');
  const result = { purged: 0, failed: 0 };
  for (let index = 0; index < limit; index += 1) {
    if (options.signal?.aborted) break;
    const job = await getDb().$transaction(async tx => {
      if (options.signal?.aborted) return null;
      // Aguarda a tentativa anterior e suas duas gravações com timeout de 30 s.
      // Remoção lógica já nega a leitura; nenhum trabalho externo fica no lock.
      const rows = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM app."MediaAsset" WHERE state IN ('REMOVING','REMOVED')
        AND "removedAt" IS NOT NULL AND "availableAt" <= clock_timestamp()
        AND ("leaseUntil" IS NULL OR "leaseUntil" < clock_timestamp() - interval '2 minutes')
        ORDER BY "availableAt", id FOR UPDATE SKIP LOCKED LIMIT 1`;
      if (!rows.length || options.signal?.aborted) return null;
      const now = await databaseNow(tx);
      if (options.signal?.aborted) return null;
      const token = randomUUID();
      const asset = await tx.mediaAsset.update({ where: { id: rows[0].id }, data: {
        leaseToken: token, leaseUntil: new Date(now.getTime() + 300_000),
      } });
      return { asset, token };
    });
    if (!job) break;
    try {
      const objects = await listAssetObjects(job.asset.id);
      await deleteObjects(objects);
      if ((await listAssetObjects(job.asset.id)).length) throw new Error('Objetos ainda pendentes.');
      await getDb().$transaction(async tx => {
        const now = await databaseNow(tx);
        await tx.$queryRaw`SELECT id FROM app."MediaAsset" WHERE id=${job.asset.id}::uuid FOR UPDATE`;
        const asset = await tx.mediaAsset.findFirst({ where: { id: job.asset.id,
          leaseToken: job.token, state: { in: ['REMOVING', 'REMOVED'] }, removedAt: { not: null } } });
        if (!asset) return;
        await tx.mediaPart.deleteMany({ where: { assetId: asset.id } });
        await tx.mediaAsset.update({ where: { id: asset.id }, data: { state: 'REMOVED',
          purgedAt: asset.purgedAt ?? now, leaseToken: null, leaseUntil: null,
          // Reconciliar tombstones também captura escrita tardia anterior à remoção.
          availableAt: new Date(now.getTime() + 3_600_000),
        } });
        result.purged += 1;
      });
    } catch {
      result.failed += 1;
      await getDb().$transaction(async tx => {
        const now = await databaseNow(tx);
        await tx.mediaAsset.updateMany({ where: { id: job.asset.id, leaseToken: job.token,
          state: { in: ['REMOVING', 'REMOVED'] } }, data: {
          leaseToken: null, leaseUntil: null, availableAt: new Date(now.getTime() + 30_000),
        } });
      });
    }
  }
  return result;
}
