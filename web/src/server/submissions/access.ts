import '../only.ts';
import type { Activity, ActivitySubmission, Membership } from '../../generated/prisma/client.ts';
import { requireActivity } from '../activities/access.ts';
import { requireConversationAudience } from '../conversations/access.ts';
import type { StoreScope } from '../stores/transaction.ts';
import { requireMembership } from '../stores/transaction.ts';
import { resourceId, unavailable } from '../stores/validation.ts';

export function requireParticipant(scope: StoreScope): Membership {
  const membership = requireMembership(scope);
  if (membership.role !== 'PARTICIPANT') unavailable();
  return membership;
}

export async function requireSubmission(scope: StoreScope, submissionId: string): Promise<{
  submission: ActivitySubmission; activity: Activity;
}> {
  const id = resourceId(submissionId);
  const address = await scope.tx.activitySubmission.findFirst({ where: { id, storeId: scope.store.id } });
  if (!address) unavailable();
  await requireConversationAudience(scope, address.participantMembershipId);
  if (address.status === 'DRAFT' && address.authorProfileId !== scope.identity.userId) unavailable();
  const activity = await requireActivity(scope, address.activityId);
  await scope.tx.$queryRaw`SELECT id FROM app."ActivitySubmission" WHERE id=${id}::uuid AND "storeId"=${scope.store.id}::uuid FOR UPDATE`;
  const submission = await scope.tx.activitySubmission.findFirst({ where: { id, storeId: scope.store.id } });
  if (!submission) unavailable();
  return { submission, activity };
}
