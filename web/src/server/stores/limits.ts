import '../only.ts';
import { createHmac } from 'node:crypto';
import type { Identity } from '../auth/types.ts';
import { getDb } from '../db/client.ts';
import { getServerEnv } from '../env.ts';
import { AppError } from '../errors.ts';
import { databaseNow } from './transaction.ts';

export async function consumeStoreLimit(identity: Identity, kind: 'read' | 'write'): Promise<void> {
  const count = kind === 'read' ? 120 : 30;
  const key = createHmac('sha256', getServerEnv().rateLimitSecret)
    .update('meumimo:t04:domain-rate:v1\0').update(kind).update('\0').update(identity.userId).digest('hex');
  const retryAfter = await getDb().$transaction(async tx => {
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
    const now = await databaseNow(tx);
    const bucket = await tx.authRateBucket.findUnique({ where: { key } });
    const attempts = (bucket?.attempts ?? []).filter(attempt => attempt.getTime() > now.getTime() - 60_000)
      .sort((left, right) => left.getTime() - right.getTime());
    if (attempts.length >= count) return Math.max(1, Math.ceil((attempts[0].getTime() + 60_000 - now.getTime()) / 1000));
    attempts.push(now);
    await tx.authRateBucket.upsert({ where: { key }, create: { key, attempts }, update: { attempts } });
    return 0;
  }, { maxWait: 5_000, timeout: 10_000 });
  if (retryAfter) throw new AppError('rate_limited', 429, 'Aguarde antes de tentar novamente.', retryAfter);
}
