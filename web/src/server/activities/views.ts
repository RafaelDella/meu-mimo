import '../only.ts';
import type { Activity } from '../../generated/prisma/client.ts';
import type { ActivityAvailability, ActivityFields, ActivityView } from '../../contracts/activities.ts';
import type { StoreScope } from '../stores/transaction.ts';
import { requireMembership } from '../stores/transaction.ts';
import { AppError } from '../errors.ts';
import { periodAt } from './periods.ts';
import type { ActivityPeriod } from './periods.ts';
import { suppressionFor } from '../privacy/suppression.ts';
import type { Suppressions } from '../privacy/suppression.ts';
import { visibleAuthoredFields } from '../privacy/views.ts';

export function activityConfiguration(activity: Activity): ActivityFields {
  return { name: activity.name, description: activity.description, category: activity.category,
    sticker: activity.sticker as ActivityFields['sticker'], points: activity.points,
    frequency: activity.frequency, weeklyLimit: activity.weeklyLimit, approvalMode: activity.approvalMode };
}

export async function receivedCount(scope: StoreScope, activityId: string, membershipId: string, period: ActivityPeriod): Promise<number> {
  return scope.tx.activitySubmission.count({ where: { storeId: scope.store.id, activityId,
    participantMembershipId: membershipId, receivedAt: { not: null,
      ...(period.startsAt ? { gte: period.startsAt } : {}), ...(period.endsAt ? { lt: period.endsAt } : {}) } } });
}

export async function activityAvailability(scope: StoreScope, activity: Activity, now: Date): Promise<ActivityAvailability> {
  const actor = requireMembership(scope);
  const period = await periodAt(scope.tx, scope.store.timezone, activity.frequency, now);
  const used = await receivedCount(scope, activity.id, actor.id, period);
  const limit = activity.frequency === 'WEEKLY' ? activity.weeklyLimit : 1;
  const reason = actor.closedAt ? 'MEMBERSHIP_CLOSED' : scope.store.state === 'CLOSED' ? 'STORE_CLOSED' :
    scope.store.platformPausedAt ? 'STORE_PLATFORM_PAUSED' : scope.store.state !== 'ACTIVE' ? 'STORE_CLOSED' :
    activity.archivedAt ? 'ARCHIVED' : used >= limit ? 'LIMIT' : 'AVAILABLE';
  return { eligible: reason === 'AVAILABLE', used, limit, remaining: Math.max(0, limit - used), reason,
    localDate: period.localDate, timezone: period.timezone, startsAt: period.startsAt?.toISOString() ?? null,
    endsAt: period.endsAt?.toISOString() ?? null, now: now.toISOString() };
}

export async function activityView(scope: StoreScope, activity: Activity, now: Date, suppressions?: Suppressions): Promise<ActivityView> {
  const privacy = suppressions ?? await suppressionFor(scope.tx, [activity.createdByProfileId]);
  const content = visibleAuthoredFields(activityConfiguration(activity), ['name', 'description', 'category'], activity.createdByProfileId, privacy);
  return { ...content, id: activity.id, storeId: activity.storeId, version: activity.version,
    createdAt: activity.createdAt.toISOString(), archivedAt: activity.archivedAt?.toISOString() ?? null,
    availability: requireMembership(scope).role === 'PARTICIPANT' ? await activityAvailability(scope, activity, now) : null };
}

export function assertActivityOpen(activity: Activity): void {
  if (activity.archivedAt) throw new AppError('activity_archived', 409, 'Esta atividade foi arquivada. Os registros anteriores continuam disponíveis.');
}

export function assertOccurrenceAvailable(used: number, activity: Activity): void {
  if (used >= (activity.frequency === 'WEEKLY' ? activity.weeklyLimit : 1)) {
    throw new AppError('activity_limit_reached', 409, 'Você já atingiu o limite desta atividade neste período. Confira seus registros.');
  }
}
