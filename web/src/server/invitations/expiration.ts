import '../only.ts';
import type { ExpirationCandidate, ExpirationInput } from '../../contracts/invitations.ts';
import type { Identity } from '../auth/types.ts';
import { AppError } from '../errors.ts';
import { consumeStoreLimit } from '../stores/limits.ts';
import { requireMerchant, withStoreTransaction, type StoreTransaction } from '../stores/transaction.ts';
import { allowedFields, invalidField } from '../stores/validation.ts';
import { parseMinuteInstant, validCivilMinute } from './validation.ts';

/** Enumera os offsets reais dos dois lados da transição sem corrigir lacunas. */
export async function candidatesAt(tx: StoreTransaction, timezone: string, localDateTime: string): Promise<ExpirationCandidate[]> {
  if (!validCivilMinute(localDateTime)) invalidField();
  const rows = await tx.$queryRaw<{ candidate: Date; offsetMinutes: number }[]>`
    WITH local AS (SELECT ${localDateTime}::timestamp AS value), candidates AS (
      SELECT value, (value AT TIME ZONE 'UTC') -
        ((probe AT TIME ZONE ${timezone}) - (probe AT TIME ZONE 'UTC')) AS candidate
      FROM local CROSS JOIN LATERAL generate_series(
        (value AT TIME ZONE ${timezone}) - interval '36 hours',
        (value AT TIME ZONE ${timezone}) + interval '36 hours', interval '6 hours') AS probe
    ) SELECT DISTINCT candidate,
      (EXTRACT(EPOCH FROM ((candidate AT TIME ZONE ${timezone}) - (candidate AT TIME ZONE 'UTC'))) / 60)::int AS "offsetMinutes"
    FROM candidates WHERE candidate AT TIME ZONE ${timezone} = value ORDER BY candidate`;
  return rows.map(row => {
    const absolute = Math.abs(row.offsetMinutes);
    const offset = `${row.offsetMinutes < 0 ? '-' : '+'}${String(Math.floor(absolute / 60)).padStart(2, '0')}:${String(absolute % 60).padStart(2, '0')}`;
    return { at: `${localDateTime}:00${offset}`, offset };
  });
}

export async function expirationCandidates(identity: Identity, storeId: string, body: Record<string, unknown>) {
  allowedFields(body, ['localDateTime']);
  if (typeof body.localDateTime !== 'string' || !validCivilMinute(body.localDateTime)) invalidField();
  const localDateTime = body.localDateTime;
  await consumeStoreLimit(identity, 'read');
  return withStoreTransaction(identity, storeId, async scope => {
    requireMerchant(scope);
    return { timezone: scope.store.timezone, candidates: await candidatesAt(scope.tx, scope.store.timezone, localDateTime) };
  });
}

export async function invitationExpiration(tx: StoreTransaction, timezone: string, input: ExpirationInput, now: Date): Promise<Date | null> {
  if (input.kind === 'NEVER') return null;
  if (input.kind === 'AFTER_DAYS') return new Date(now.getTime() + input.days * 24 * 60 * 60 * 1000);
  const requested = parseMinuteInstant(input.at);
  const candidates = await candidatesAt(tx, timezone, requested.localDateTime);
  if (!candidates.some(candidate => candidate.offset === requested.offset && new Date(candidate.at).getTime() === requested.instant.getTime())) {
    throw new AppError('invitation_expiration_invalid', 400, 'Confira o horário e o fuso da lojinha. Escolha um dos horários válidos.');
  }
  if (requested.instant.getTime() <= now.getTime()) {
    throw new AppError('invitation_expiration_past', 400, 'Escolha uma data de validade futura.');
  }
  return requested.instant;
}
