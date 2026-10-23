import '../only.ts';
import { getDb } from '../db/client.ts';
import { AppError } from '../errors.ts';
import { databaseNow } from '../stores/transaction.ts';
import { projectNotificationGroup } from '../notifications/group-projection.ts';

type Outcome = 'delivered' | 'failed' | 'empty';

async function deliverOne(signal?: AbortSignal): Promise<Outcome> {
  let eventId: string | undefined;
  try {
    return await getDb().$transaction(async tx => {
      if (signal?.aborted) return 'empty';
      const rows = await tx.$queryRaw<{ id: string; attempts: number }[]>`
        SELECT id, attempts FROM app."OutboxEvent"
        WHERE "processedAt" IS NULL AND "availableAt" <= clock_timestamp()
        ORDER BY "availableAt" ASC, "createdAt" ASC, id ASC
        FOR UPDATE SKIP LOCKED LIMIT 1`;
      if (!rows.length || signal?.aborted) return 'empty';
      eventId = rows[0].id;
      await tx.notification.createMany({ data: { eventId }, skipDuplicates: true });
      const notification = await tx.notification.findUniqueOrThrow({ where: { eventId }, select: { id: true } });
      await projectNotificationGroup(tx, notification.id);
      await tx.outboxEvent.update({ where: { id: eventId }, data: {
        processedAt: await databaseNow(tx), attempts: Math.min(rows[0].attempts + 1, 2_147_483_647), lastErrorCode: null,
      } });
      return 'delivered';
    }, { maxWait: 5_000, timeout: 10_000 });
  } catch {
    if (!eventId) throw new AppError('outbox_unavailable', 503, 'Não foi possível consultar a entrega de novidades.');
    // O rollback libera a linha; não atrasar um evento que outro consumidor já confirmou.
    try {
      await getDb().$executeRaw`
        UPDATE app."OutboxEvent"
        SET "availableAt" = clock_timestamp() +
              (LEAST(60, power(2, LEAST(attempts, 6))) * interval '1 second'),
            attempts = LEAST(attempts, 2147483646) + 1,
            "lastErrorCode" = 'delivery_failed'
        WHERE id = ${eventId}::uuid AND "processedAt" IS NULL`;
    } catch {
      throw new AppError('outbox_unavailable', 503, 'Não foi possível registrar a nova tentativa de entrega.');
    }
    return 'failed';
  }
}

/** Entrega somente no banco; nenhuma chamada externa ocorre sob o bloqueio. */
export async function deliverOutboxBatch(options: { limit?: number; signal?: AbortSignal } = {}): Promise<{ delivered: number; failed: number }> {
  const limit = options.limit ?? 20;
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
    throw new AppError('field_invalid', 400, 'O lote deve conter entre 1 e 50 eventos.');
  }
  const result = { delivered: 0, failed: 0 };
  for (let index = 0; index < limit; index += 1) {
    if (options.signal?.aborted) break;
    const outcome = await deliverOne(options.signal);
    if (outcome === 'empty') break;
    result[outcome] += 1;
  }
  return result;
}
