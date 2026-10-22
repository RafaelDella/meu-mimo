import '../only.ts';
import type { MediaCollection } from '../../generated/prisma/client.ts';
import type { StoreScope } from '../stores/transaction.ts';
import { databaseNow } from '../stores/transaction.ts';
import { invalidField } from '../stores/validation.ts';
import { requireMediaCollection } from './access.ts';

/** A origem atualiza proteção/encerramento na mesma transação da análise ou relação. */
export async function setMediaRetention(scope: StoreScope, collectionId: string, input: {
  hold: boolean; closedAt: Date | null;
}): Promise<MediaCollection> {
  const context = await requireMediaCollection(scope, collectionId);
  if (typeof input.hold !== 'boolean' || (input.closedAt !== null &&
      (!(input.closedAt instanceof Date) || !Number.isFinite(input.closedAt.getTime())))) invalidField();
  if (context.collection.purpose === 'EVIDENCE' && input.closedAt !== null) invalidField();
  const now = await databaseNow(scope.tx);
  if (input.closedAt && input.closedAt > now) invalidField();
  let until: Date | null = null;
  if (input.closedAt) {
    until = new Date(input.closedAt);
    until.setUTCFullYear(until.getUTCFullYear() + 1);
    // Doze meses de calendário: 29/02 encerra o prazo em 28/02 no ano seguinte.
    if (until.getUTCMonth() !== input.closedAt.getUTCMonth()) until.setUTCDate(0);
  }
  return scope.tx.mediaCollection.update({ where: { id: context.collection.id }, data: {
    retentionHold: input.hold, retentionUntil: until,
  } });
}
