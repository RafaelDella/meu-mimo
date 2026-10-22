import '../only.ts';
import { AppError } from '../errors.ts';
import type { StoreTransaction } from './transaction.ts';
import { unavailable } from './validation.ts';

export const LIFECYCLE_DEPENDENCIES_STAGE = 'T04_STORES_ONLY' as const;

/** T07–T10 devem integrar suas consultas nesta mesma transação antes de ativar o domínio. */
export async function assertLifecycleDependencies(
  tx: StoreTransaction,
  scope: { storeId: string; membershipId?: string },
): Promise<void> {
  const store = await tx.store.findUnique({ where: { id: scope.storeId }, select: { domainStartedAt: true } });
  if (!store) unavailable();
  // T04 não possui registros ou tickets. O marcador exige integração futura;
  // sua ausência não é apresentada como contagem de pendências consultada.
  if (store.domainStartedAt) {
    throw new AppError('lifecycle_dependencies_unavailable', 409,
      'O encerramento precisa conferir as pendências dos registros e tickets antes de continuar.');
  }
}
