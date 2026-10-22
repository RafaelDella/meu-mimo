import '../only.ts';
import { createHmac } from 'node:crypto';
import { getDb } from '../db/client.ts';
import { getServerEnv } from '../env.ts';
import { AppError } from '../errors.ts';

type AuthLimit = 'login' | 'recovery';

const limits = {
  login: { count: 5, windowMs: 60_000 },
  recovery: { count: 3, windowMs: 3_600_000 },
};

export async function consumeAuthLimit(kind: AuthLimit, email: string, origin: string): Promise<void> {
  const rule = limits[kind];
  const key = createHmac('sha256', getServerEnv().rateLimitSecret)
    .update(kind).update('\0')
    .update(email.trim().toLowerCase()).update('\0')
    .update(kind === 'login' ? origin : '')
    .digest('hex');

  const retryAfter = await getDb().$transaction(async transaction => {
    // O lock serializa a mesma chave, inclusive entre processos da aplicação.
    await transaction.$queryRaw`
      SELECT 1 AS locked
      FROM pg_advisory_xact_lock(hashtextextended(${key}, 0))
    `;
    const clock = await transaction.$queryRaw<{ now: Date }[]>`
      SELECT clock_timestamp() AS now
    `;
    const now = clock[0].now;
    const cutoff = now.getTime() - rule.windowMs;
    const bucket = await transaction.authRateBucket.findUnique({ where: { key } });
    const attempts = (bucket?.attempts ?? [])
      .filter(attempt => attempt.getTime() > cutoff)
      .sort((left, right) => left.getTime() - right.getTime());

    if (attempts.length >= rule.count) {
      return Math.max(1, Math.ceil((attempts[0].getTime() + rule.windowMs - now.getTime()) / 1000));
    }
    attempts.push(now);
    await transaction.authRateBucket.upsert({
      where: { key },
      create: { key, attempts },
      update: { attempts },
    });
    return 0;
  }, { maxWait: 5_000, timeout: 10_000 });

  if (retryAfter) {
    throw new AppError('rate_limited', 429, 'Aguarde antes de tentar novamente.', retryAfter);
  }
}
