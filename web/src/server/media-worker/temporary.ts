import '../only.ts';
import { lstat, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { getDb } from '../db/client.ts';
import { AppError } from '../errors.ts';
import { databaseNow } from '../stores/transaction.ts';
import { mediaWorkerConfig } from './config.ts';

const uuid = '[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}';
const attemptDirectory = new RegExp(`^(${uuid})(?:-(${uuid}))?-([a-z0-9]{6})$`, 'i');

/** Reconciliar tentativas que morreram sem finally, incluindo nomes da versão anterior. */
export async function purgeTemporaryMediaBatch(options: { limit?: number } = {}): Promise<{ purged: number; failed: number }> {
  const limit = options.limit ?? 20;
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new AppError('field_invalid', 400, 'Lote de limpeza inválido.');
  const root = path.resolve(mediaWorkerConfig().temp);
  const result = { purged: 0, failed: 0 };
  let entries;
  try { entries = await readdir(root, { withFileTypes: true }); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return result;
    throw error;
  }
  let attempted = 0;
  for (const entry of entries) {
    const match = attemptDirectory.exec(entry.name);
    if (!entry.isDirectory() || !match) continue;
    const target = path.resolve(root, entry.name);
    if (path.dirname(target) !== root) throw new AppError('media_configuration_invalid', 503, 'Temporário fora do diretório reservado.');
    try {
      const metadata = await lstat(target);
      if (!metadata.isDirectory() || metadata.isSymbolicLink()) continue;
      const active = await getDb().$transaction(async tx => {
        const now = await databaseNow(tx);
        // Dez minutos cobrem lease de cinco minutos e a quarentena de gravações.
        if (metadata.mtimeMs > now.getTime() - 600_000) return true;
        const asset = await tx.mediaAsset.findUnique({ where: { id: match[1].toLowerCase() },
          select: { leaseToken: true, leaseUntil: true } });
        const owns = !match[2] || asset?.leaseToken === match[2].toLowerCase();
        return Boolean(owns && asset?.leaseUntil && asset.leaseUntil.getTime() + 120_000 > now.getTime());
      });
      if (active) continue;
      if (attempted++ >= limit) break;
      await rm(target, { recursive: true, force: true });
      result.purged += 1;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') result.failed += 1;
    }
  }
  return result;
}
