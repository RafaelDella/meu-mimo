import '../only.ts';
import type { Prisma } from '../../generated/prisma/client.ts';
import type { Identity } from '../auth/types.ts';
import type { NotificationTarget, NotificationView } from '../../contracts/notifications.ts';
import { unavailable } from '../stores/validation.ts';

export const notificationSelect = {
  id: true, createdAt: true, readAt: true,
  event: { select: {
    kind: true, storeId: true, participantMembershipId: true, createdAt: true,
    actor: { select: { displayName: true } }, store: { select: { name: true } },
    comment: { select: { conversation: { select: { id: true, subjectType: true, subjectId: true } } } },
  } },
} satisfies Prisma.NotificationSelect;

export type SelectedNotification = Prisma.NotificationGetPayload<{ select: typeof notificationSelect }>;

/** O destinatário persistido não substitui os vínculos autorizados atuais. */
export function notificationAudience(identity: Identity, storeId?: string): Prisma.NotificationWhereInput {
  return { event: {
    ...(storeId ? { storeId } : {}),
    recipientMembership: { profileId: identity.userId, accessRevokedAt: null },
    participantMembership: { role: 'PARTICIPANT', accessRevokedAt: null },
    OR: [
      { kind: 'INVITATION_ACCEPTED', invitationId: { not: null }, recipientMembership: { role: 'MERCHANT' } },
      { kind: 'COMMENT_CREATED', comment: { conversation: { participantMembership: { accessRevokedAt: null } } } },
    ],
  } };
}

export function notificationView(notification: SelectedNotification): NotificationView {
  return {
    id: notification.id, kind: notification.event.kind, storeId: notification.event.storeId,
    storeName: notification.event.store.name, createdAt: notification.createdAt.toISOString(),
    occurredAt: notification.event.createdAt.toISOString(), readAt: notification.readAt?.toISOString() ?? null,
    actor: { displayName: notification.event.actor.displayName },
  };
}

export function notificationTarget(notification: SelectedNotification): NotificationTarget {
  const { event } = notification;
  const common = { storeId: event.storeId, participantMembershipId: event.participantMembershipId };
  if (event.kind === 'INVITATION_ACCEPTED') return { ...common, type: 'membership', path: `/lojas/${event.storeId}/pessoas` };
  const conversation = event.comment?.conversation;
  if (!conversation) unavailable();
  return {
    ...common, type: 'conversation', conversationId: conversation.id,
    subjectType: conversation.subjectType, subjectId: conversation.subjectId, path: null,
  };
}
