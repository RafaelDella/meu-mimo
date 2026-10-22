import '../only.ts';
import type { ActivitySubmission, Redemption, RedemptionEvent, SubmissionReviewEvent } from '../../generated/prisma/client.ts';
import type { StoreScope } from '../stores/transaction.ts';
import { invalidField } from '../stores/validation.ts';

/** A ponta sem compensação determina a situação financeira sem reescrever a origem. */
export async function submissionFunding(scope: StoreScope, submissionId: string) {
  const terminal = await scope.tx.pointsEntry.findFirst({ where: { storeId: scope.store.id, submissionId,
    compensation: { is: null } } });
  return { terminal, credited: Boolean(terminal && terminal.amount > 0n) };
}

export async function availablePoints(scope: StoreScope, membershipId: string): Promise<bigint> {
  const rows = await scope.tx.$queryRaw<{ amount: string }[]>`
    SELECT COALESCE(sum(amount),0)::text AS amount FROM app."PointsEntry"
    WHERE "storeId"=${scope.store.id}::uuid AND "participantMembershipId"=${membershipId}::uuid`;
  return BigInt(rows[0].amount);
}

/** A decisão e a cadeia financeira são gravadas na transação da origem. */
export async function recordReviewPoints(scope: StoreScope, submission: ActivitySubmission,
  event: SubmissionReviewEvent, terminalId: string | null): Promise<void> {
  if (event.delta === 0n) return;
  if (!submission.points || submission.points < 1 || submission.points > 1_000_000 ||
      event.submissionId !== submission.id || event.storeId !== scope.store.id ||
      event.actorProfileId !== scope.identity.userId) invalidField();
  const kind = event.action === 'VOID' ? 'ACTIVITY_REVERSAL' : terminalId ? 'ACTIVITY_RESTORE' : 'ACTIVITY_CREDIT';
  const sourceKey = kind === 'ACTIVITY_CREDIT' ? `submission.credit:${submission.id}` :
    kind === 'ACTIVITY_REVERSAL' ? `submission.reverse:${event.id}` : `submission.restore:${event.id}`;
  await scope.tx.pointsEntry.create({ data: { storeId: scope.store.id,
    participantMembershipId: submission.participantMembershipId, submissionId: submission.id,
    actorProfileId: event.actorProfileId, kind, amount: event.delta, sourceKey,
    reviewEventId: event.id, compensatesEntryId: terminalId, createdAt: event.createdAt } });
}

/** A devolução compensa somente o débito da emissão, sem participar da cadeia de atividades. */
export async function refundRedemption(scope: StoreScope, ticket: Redemption, event: RedemptionEvent): Promise<void> {
  if (event.kind !== 'CANCEL' || event.redemptionId !== ticket.id || event.storeId !== scope.store.id ||
      event.actorProfileId !== scope.identity.userId || event.delta !== BigInt(ticket.rewardCost)) invalidField();
  const debit = await scope.tx.pointsEntry.findUnique({ where: { sourceKey: `redemption.debit:${ticket.id}` } });
  if (!debit || debit.redemptionId !== ticket.id || debit.kind !== 'REDEMPTION_DEBIT' ||
      debit.storeId !== scope.store.id || debit.participantMembershipId !== ticket.participantMembershipId ||
      debit.amount !== -event.delta) invalidField();
  await scope.tx.pointsEntry.create({ data: { storeId: scope.store.id,
    participantMembershipId: ticket.participantMembershipId, redemptionId: ticket.id,
    actorProfileId: event.actorProfileId, kind: 'REDEMPTION_REFUND', amount: event.delta,
    sourceKey: `redemption.refund:${ticket.id}`, redemptionEventId: event.id,
    compensatesEntryId: debit.id, createdAt: event.createdAt } });
}
