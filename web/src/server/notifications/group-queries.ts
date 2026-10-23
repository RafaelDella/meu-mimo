import '../only.ts';
import type { Prisma } from '../../generated/prisma/client.ts';
import type { NotificationCategory, NotificationGroupView } from '../../contracts/notifications.ts';
import type { Identity } from '../auth/types.ts';
import type { StoreTransaction } from '../stores/transaction.ts';
import { unavailable } from '../stores/validation.ts';
import { notificationAudience, notificationSelect, notificationView } from './queries.ts';
import { suppressionFor } from '../privacy/suppression.ts';
import type { Suppressions } from '../privacy/suppression.ts';
import { visibleAuthoredFields } from '../privacy/views.ts';

export function groupAudience(identity: Identity, storeId?: string): Prisma.NotificationGroupWhereInput {
  return { ...(storeId ? { storeId } : {}), recipient: { profileId: identity.userId, accessRevokedAt: null },
    notifications: { some: notificationAudience(identity, storeId) } };
}

export const groupSelect = {
  id: true, version: true, storeId: true, category: true, lastDeliveredAt: true, actorProfileId: true,
  store: { select: { name: true, createdByProfileId: true } },
  recipient: { select: { notificationPreference: { select: { socialMuted: true, automaticApprovalNotices: true } } } },
} satisfies Prisma.NotificationGroupSelect;
type Group = Prisma.NotificationGroupGetPayload<{ select: typeof groupSelect }>;

export async function groupView(tx: StoreTransaction, identity: Identity, group: Group, suppressions?: Suppressions): Promise<NotificationGroupView> {
  const members = await tx.notification.findMany({ where: { groupId: group.id, ...notificationAudience(identity, group.storeId) },
    select: { ...notificationSelect, event: { select: { ...notificationSelect.event.select,
      submission: { select: { id: true, status: true, approvalMode: true } } } } },
    orderBy: [{ event: { createdAt: 'asc' } }, { id: 'asc' }],
  });
  if (!members.length) unavailable();
  const first = members[0]; const latest = members[members.length - 1];
  const privacy = suppressions ?? await suppressionFor(tx, [group.store.createdByProfileId, ...members.map(row => row.event.actorProfileId)]);
  const preferences = group.recipient.notificationPreference;
  const automatic = latest.event.kind === 'SUBMISSION_RECEIVED' && latest.event.submission?.approvalMode === 'AUTOMATIC';
  const attentionActive = group.category === 'SOCIAL' ? !preferences?.socialMuted :
    !automatic || (preferences?.automaticApprovalNotices ?? true);
  return { id: group.id, version: group.version, storeId: group.storeId,
    storeName: visibleAuthoredFields(group.store, ['name'], group.store.createdByProfileId, privacy).name,
    category: group.category as NotificationCategory, count: members.length,
    unreadCount: members.filter(member => member.readAt === null).length, attentionActive,
    latest: notificationView(latest, privacy), firstOccurredAt: first.event.createdAt.toISOString(),
    lastOccurredAt: latest.event.createdAt.toISOString(), lastDeliveredAt: group.lastDeliveredAt.toISOString() };
}

/** Só grupos não lidos autorizados entram no contador; preferências não alteram os registros. */
export async function attentionUnreadCount(tx: StoreTransaction, identity: Identity, storeId?: string): Promise<number> {
  const groups = await tx.notificationGroup.findMany({ where: { ...groupAudience(identity, storeId),
    notifications: { some: { ...notificationAudience(identity, storeId), readAt: null } } },
    select: { category: true, recipient: groupSelect.recipient,
      notifications: { where: { ...notificationAudience(identity, storeId), readAt: null }, take: 1,
        select: { event: { select: { kind: true, submission: { select: { approvalMode: true } } } } } } },
  });
  return groups.filter(group => {
    const preferences = group.recipient.notificationPreference;
    if (group.category === 'SOCIAL') return !preferences?.socialMuted;
    const event = group.notifications[0]?.event;
    return event?.kind !== 'SUBMISSION_RECEIVED' || event.submission?.approvalMode !== 'AUTOMATIC' ||
      (preferences?.automaticApprovalNotices ?? true);
  }).length;
}
