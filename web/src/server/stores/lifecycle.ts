import '../only.ts';
import { AppError } from '../errors.ts';
import type { StoreTransaction } from './transaction.ts';
import { unavailable } from './validation.ts';

export const LIFECYCLE_DEPENDENCIES_STAGE = 'T08_REVIEW' as const;

/** A origem consulta pendências no mesmo lock da loja; T09 acrescenta os tickets. */
export async function assertLifecycleDependencies(
  tx: StoreTransaction,
  scope: { storeId: string; membershipId?: string },
): Promise<void> {
  const store = await tx.store.findUnique({ where: { id: scope.storeId }, select: { domainStartedAt: true } });
  if (!store) unavailable();
  const pending = await tx.activitySubmission.count({ where: { storeId: scope.storeId,
    ...(scope.membershipId ? { participantMembershipId: scope.membershipId } : {}),
    status: { in: ['PENDING', 'CONTESTED'] }, receivedAt: { not: null } } });
  if (pending) throw new AppError('pending_submissions', 409,
    'Resolva os registros em análise antes de encerrar. O histórico continuará disponível.');
}
