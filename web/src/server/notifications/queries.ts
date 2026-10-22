import '../only.ts';
import type { Prisma } from '../../generated/prisma/client.ts';
import type { Identity } from '../auth/types.ts';
import type { NotificationTarget, NotificationView } from '../../contracts/notifications.ts';
import type { StoreTransaction } from '../stores/transaction.ts';
import { unavailable } from '../stores/validation.ts';

export const notificationSelect = {
  id: true, createdAt: true, readAt: true,
  event: { select: {
    kind: true, storeId: true, participantMembershipId: true, createdAt: true,
    actor: { select: { displayName: true } }, store: { select: { name: true } },
    comment: { select: { conversation: { select: { id: true, subjectType: true, subjectId: true } } } },
    submission: { select: { id: true, status: true } },
    reviewEvent: { select: { id: true } },
    redemption: { select: { id: true } },
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
      { kind: 'SUBMISSION_RECEIVED', submission: { status: { not: 'DRAFT' } }, recipientMembership: { role: 'MERCHANT' } },
      { kind: 'SUBMISSION_REVIEWED', reviewEventId: { not: null }, submission: { status: { not: 'DRAFT' } },
        recipientMembership: { role: 'PARTICIPANT' } },
      { kind: 'SUBMISSION_RESPONDED', reviewEventId: { not: null }, submission: { status: { not: 'DRAFT' } },
        recipientMembership: { role: 'MERCHANT' } },
      { kind: 'REDEMPTION_ISSUED', redemptionId: { not: null }, recipientMembership: { role: 'MERCHANT' } },
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

export async function notificationTarget(notification: SelectedNotification, tx: StoreTransaction): Promise<NotificationTarget> {
  const { event } = notification;
  const common = { storeId: event.storeId, participantMembershipId: event.participantMembershipId };
  if (event.kind === 'INVITATION_ACCEPTED') return { ...common, type: 'membership', path: `/lojas/${event.storeId}/pessoas` };
  if (event.kind === 'REDEMPTION_ISSUED') {
    if (!event.redemption) unavailable();
    return { ...common, type: 'ticket', subjectId: event.redemption.id,
      path: `/lojas/${event.storeId}/tickets/${event.redemption.id}` };
  }
  if (['SUBMISSION_RECEIVED', 'SUBMISSION_REVIEWED', 'SUBMISSION_RESPONDED'].includes(event.kind)) {
    if (!event.submission || event.submission.status === 'DRAFT') unavailable();
    return { ...common, type: 'submission', subjectId: event.submission.id,
      path: `/lojas/${event.storeId}/registros/${event.submission.id}${event.reviewEvent ? `?evento=${event.reviewEvent.id}` : ''}` };
  }
  const conversation = event.comment?.conversation;
  if (!conversation) unavailable();
  const submission = conversation.subjectType === 'SUBMISSION' ? await tx.activitySubmission.findFirst({
    where: { id: conversation.subjectId, storeId: event.storeId,
      participantMembershipId: event.participantMembershipId, receivedAt: { not: null } }, select: { id: true },
  }) : null;
  const ticket = conversation.subjectType === 'TICKET' ? await tx.redemption.findFirst({
    where: { id: conversation.subjectId, storeId: event.storeId,
      participantMembershipId: event.participantMembershipId }, select: { id: true },
  }) : null;
  return {
    ...common, type: 'conversation', conversationId: conversation.id,
    subjectType: conversation.subjectType, subjectId: conversation.subjectId,
    path: submission ? `/lojas/${event.storeId}/registros/${submission.id}` :
      ticket ? `/lojas/${event.storeId}/tickets/${ticket.id}` : null,
  };
}
