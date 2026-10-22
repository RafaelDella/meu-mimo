import '../only.ts';
import { createHmac } from 'node:crypto';
import type { Identity } from '../auth/types.ts';
import { getServerEnv } from '../env.ts';
import { AppError } from '../errors.ts';
import { withIdentityTransaction } from '../stores/transaction.ts';

export async function consumeMediaLimit(identity: Identity, kind: 'reserve' | 'part', weight = 1): Promise<void> {
  const maximum = kind === 'reserve' ? 20 : 240;
  if (!Number.isInteger(weight) || weight < 1 || weight > 10) throw new Error('Peso de limite inválido.');
  const key = createHmac('sha256', getServerEnv().rateLimitSecret).update(`media-${kind}\0${identity.userId}`).digest('hex');
  const retryAfter = await withIdentityTransaction(identity, async tx => {
    await tx.$executeRaw`INSERT INTO app."AuthRateBucket" (key, attempts) VALUES (${key}, '{}') ON CONFLICT (key) DO NOTHING`;
    await tx.$queryRaw`SELECT key FROM app."AuthRateBucket" WHERE key = ${key} FOR UPDATE`;
    await tx.$executeRaw`UPDATE app."AuthRateBucket" SET attempts = ARRAY(
      SELECT value FROM unnest(attempts) value WHERE value > clock_timestamp() - interval '60 seconds') WHERE key = ${key}`;
    const result = await tx.$queryRaw<{ size: number; wait: number }[]>`
      SELECT cardinality(attempts)::int AS size,
        GREATEST(1, CEIL(EXTRACT(EPOCH FROM (attempts[1] + interval '60 seconds' - clock_timestamp()))))::int AS wait
      FROM app."AuthRateBucket" WHERE key = ${key}`;
    if (result[0].size + weight > maximum) return result[0].wait;
    await tx.$executeRaw`UPDATE app."AuthRateBucket" SET attempts = attempts || array_fill(clock_timestamp(), ARRAY[${weight}::int]) WHERE key = ${key}`;
    return 0;
  });
  if (retryAfter) throw new AppError('rate_limited', 429, 'Aguarde antes de continuar o envio.', retryAfter);
}
