import '../only.ts';
import type { ActivityFrequency } from '../../contracts/activities.ts';
import type { StoreTransaction } from '../stores/transaction.ts';

export type ActivityPeriod = {
  localDate: string; timezone: string; startsAt: Date | null; endsAt: Date | null; key: string; now: Date;
};

/** O incremento é de calendário local, preservando dias de 23/25 horas. */
export async function periodAt(tx: StoreTransaction, timezone: string, frequency: ActivityFrequency, now: Date): Promise<ActivityPeriod> {
  const rows = await tx.$queryRaw<{
    localDate: string; dayStart: Date; dayEnd: Date; weekDate: string; weekStart: Date; weekEnd: Date;
  }[]>`
    WITH RECURSIVE local AS (SELECT ${now}::timestamptz AT TIME ZONE ${timezone} AS value),
    boundaries AS (
      SELECT name, boundary FROM local CROSS JOIN LATERAL (VALUES
        ('dayStart',date_trunc('day',value)), ('dayEnd',date_trunc('day',value)+interval '1 day'),
        ('weekStart',date_trunc('week',value)), ('weekEnd',date_trunc('week',value)+interval '1 week')
      ) AS dates(name,boundary)
    ), candidates AS (
      -- Usar os offsets dos dois lados da fronteira: AT TIME ZONE sozinho
      -- escolhe a segunda meia-noite quando 00h se repete (ex.: Havana).
      SELECT name,boundary,(boundary AT TIME ZONE 'UTC')-
        ((probe AT TIME ZONE ${timezone})-(probe AT TIME ZONE 'UTC')) AS candidate
      FROM boundaries CROSS JOIN LATERAL generate_series(
        (boundary AT TIME ZONE ${timezone})-interval '24 hours',
        (boundary AT TIME ZONE ${timezone})+interval '24 hours',interval '24 hours') AS probe
    ), seeds AS (
      SELECT name,boundary,min(candidate) AS lo,max(candidate) AS hi,
        min(candidate) FILTER(WHERE candidate AT TIME ZONE ${timezone}=boundary) AS exact
      FROM candidates GROUP BY name,boundary
    ), gap(name,boundary,lo,hi) AS (
      -- Se a meia-noite não existe, localizar o primeiro instante válido,
      -- inclusive quando um salto cobre só parte da hora da fronteira.
      SELECT name,boundary,lo,hi FROM seeds WHERE exact IS NULL
      UNION ALL
      SELECT name,boundary,
        CASE WHEN (lo+(hi-lo)/2) AT TIME ZONE ${timezone}>=boundary THEN lo ELSE lo+(hi-lo)/2 END,
        CASE WHEN (lo+(hi-lo)/2) AT TIME ZONE ${timezone}>=boundary THEN lo+(hi-lo)/2 ELSE hi END
      FROM gap WHERE hi-lo>interval '1 microsecond'
    ), resolved AS (
      SELECT name,exact AS instant FROM seeds WHERE exact IS NOT NULL
      UNION ALL SELECT name,hi FROM gap WHERE hi-lo<=interval '1 microsecond'
    )
    SELECT to_char(value,'YYYY-MM-DD') AS "localDate",to_char(date_trunc('week',value),'YYYY-MM-DD') AS "weekDate",
      (SELECT instant FROM resolved WHERE name='dayStart') AS "dayStart",
      (SELECT instant FROM resolved WHERE name='dayEnd') AS "dayEnd",
      (SELECT instant FROM resolved WHERE name='weekStart') AS "weekStart",
      (SELECT instant FROM resolved WHERE name='weekEnd') AS "weekEnd" FROM local`;
  const date = rows[0];
  return { localDate: date.localDate, timezone, now,
    key: frequency === 'ONCE' ? 'ONCE' : frequency === 'DAILY' ? date.localDate : date.weekDate,
    startsAt: frequency === 'ONCE' ? null : frequency === 'DAILY' ? date.dayStart : date.weekStart,
    endsAt: frequency === 'ONCE' ? null : frequency === 'DAILY' ? date.dayEnd : date.weekEnd };
}
