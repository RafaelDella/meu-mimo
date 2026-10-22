import '../only.ts';
import type { MediaCollection } from '../../generated/prisma/client.ts';
import type { StoreScope } from '../stores/transaction.ts';
import { databaseNow } from '../stores/transaction.ts';
import { invalidField, unavailable } from '../stores/validation.ts';
import { requireMediaCollection } from './access.ts';

export function memoryRetentionUntil(closedAt: Date | null): Date | null {
  if (!closedAt) return null;
  const until = new Date(closedAt);
  until.setUTCFullYear(until.getUTCFullYear() + 1);
  // Doze meses de calendário: 29/02 encerra o prazo em 28/02 no ano seguinte.
  if (until.getUTCMonth() !== closedAt.getUTCMonth()) until.setUTCDate(0);
  return until;
}

/** A origem atualiza proteção/encerramento na mesma transação da análise ou relação. */
export async function setMediaRetention(scope: StoreScope, collectionId: string, input: {
  hold: boolean; closedAt: Date | null;
}): Promise<MediaCollection> {
  const context = await requireMediaCollection(scope, collectionId);
  return setOriginMediaRetention(scope, context.collection, input);
}

/** Uso interno da origem já validada: revogar audiência não interrompe a manutenção do prazo. */
export async function setOriginMediaRetention(scope: StoreScope, collection: MediaCollection, input: {
  hold: boolean; closedAt: Date | null;
}): Promise<MediaCollection> {
  if (collection.storeId !== scope.store.id) unavailable();
  await scope.tx.$queryRaw`SELECT id FROM app."MediaCollection" WHERE id=${collection.id}::uuid FOR UPDATE`;
  if (typeof input.hold !== 'boolean' || (input.closedAt !== null &&
      (!(input.closedAt instanceof Date) || !Number.isFinite(input.closedAt.getTime())))) invalidField();
  if (collection.purpose === 'EVIDENCE' && input.closedAt !== null) invalidField();
  const now = await databaseNow(scope.tx);
  if (input.closedAt && input.closedAt > now) invalidField();
  return scope.tx.mediaCollection.update({ where: { id: collection.id }, data: {
    retentionHold: input.hold, retentionUntil: memoryRetentionUntil(input.closedAt),
  } });
}
