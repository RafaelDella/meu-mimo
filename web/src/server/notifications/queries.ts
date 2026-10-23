import '../only.ts';
import type { Prisma } from '../../generated/prisma/client.ts';
import type { Identity } from '../auth/types.ts';
import type { NotificationTarget, NotificationView } from '../../contracts/notifications.ts';
import type { StoreTransaction } from '../stores/transaction.ts';
import { unavailable } from '../stores/validation.ts';
import type { Suppressions } from '../privacy/suppression.ts';
import { publicAuthor, visibleAuthoredFields } from '../privacy/views.ts';

export const notificationSelect = {
  id: true, createdAt: true, readAt: true,
  event: { select: {
    kind: true, storeId: true, participantMembershipId: true, createdAt: true, actorProfileId: true,
    actor: { select: { displayName: true } }, store: { select: { name: true, createdByProfileId: true } },
    comment: { select: { conversation: { select: { id: true, subjectType: true, subjectId: true } } } },
    submission: { select: { id: true, status: true } },
    reviewEvent: { select: { id: true } },
    noteVersion: { select: { id: true, storeId: true, participantMembershipId: true } },
    reactionEvent: { select: { conversation: { select: { id: true, subjectType: true, subjectId: true } } } },
    redemption: { select: { id: true } },
    albumEvent: { select: { id: true, kind: true, storeId: true, redemptionId: true,
      album: { select: { participantMembershipId: true } } } },
    redemptionEvent: { select: { id: true, kind: true, redemptionId: true, storeId: true,
      pointsEntry: { select: { kind: true, redemptionId: true } } } },
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
      { kind: 'REDEMPTION_UPDATED', redemptionId: { not: null }, redemptionEvent: { kind: 'REQUEST_CANCELLATION' },
        recipientMembership: { role: 'MERCHANT' } },
      { kind: 'REDEMPTION_UPDATED', redemptionId: { not: null }, redemptionEvent: { kind: { in: ['AGREE', 'FULFILL', 'REJECT_CANCELLATION', 'CANCEL'] } },
        recipientMembership: { role: 'PARTICIPANT' } },
      { kind: 'ALBUM_PUBLISHED', redemptionId: { not: null }, albumEvent: { kind: 'PUBLISH' },
        recipientMembership: { role: 'PARTICIPANT' } },
      { kind: 'NOTE_SENT', noteVersionId: { not: null }, recipientMembership: { role: 'PARTICIPANT' } },
      { kind: 'REACTION_CHANGED', reactionEvent: { conversation: { participantMembership: { accessRevokedAt: null } } } },
    ],
  } };
}

export function notificationView(notification: SelectedNotification, suppressions: Suppressions): NotificationView {
  const store = notification.event.store;
  return {
    id: notification.id, kind: notification.event.kind, storeId: notification.event.storeId,
    storeName: visibleAuthoredFields(store, ['name'], store.createdByProfileId, suppressions).name,
    createdAt: notification.createdAt.toISOString(),
    occurredAt: notification.event.createdAt.toISOString(), readAt: notification.readAt?.toISOString() ?? null,
    actor: publicAuthor(notification.event.actor, suppressions.get(notification.event.actorProfileId)),
  };
}

export async function notificationTarget(notification: SelectedNotification, tx: StoreTransaction): Promise<NotificationTarget> {
  const { event } = notification;
  const common = { storeId: event.storeId, participantMembershipId: event.participantMembershipId };
  if (event.kind === 'INVITATION_ACCEPTED') return { ...common, type: 'membership', path: `/lojas/${event.storeId}/pessoas` };
  if (event.kind === 'NOTE_SENT') {
    const version = event.noteVersion;
    if (!version || version.storeId !== event.storeId || version.participantMembershipId !== event.participantMembershipId) unavailable();
    return { ...common, type: 'note', subjectId: version.id, path: `/lojas/${event.storeId}?bilhete=${version.id}` };
  }
  if (event.kind === 'ALBUM_PUBLISHED') {
    const publication = event.albumEvent;
    if (!event.redemption || !publication || publication.kind !== 'PUBLISH' || publication.storeId !== event.storeId ||
        publication.redemptionId !== event.redemption.id ||
        publication.album.participantMembershipId !== event.participantMembershipId) unavailable();
    return { ...common, type: 'ticket', subjectId: event.redemption.id,
      path: `/lojas/${event.storeId}/tickets/${event.redemption.id}?publicacao=${publication.id}` };
  }
  if (event.kind === 'REDEMPTION_ISSUED' || event.kind === 'REDEMPTION_UPDATED') {
    if (!event.redemption) unavailable();
    const transition = event.redemptionEvent;
    if (event.kind === 'REDEMPTION_UPDATED' && (!transition || transition.storeId !== event.storeId ||
        transition.redemptionId !== event.redemption.id || (transition.kind === 'CANCEL' &&
        (transition.pointsEntry?.kind !== 'REDEMPTION_REFUND' || transition.pointsEntry.redemptionId !== event.redemption.id)))) unavailable();
    return { ...common, type: 'ticket', subjectId: event.redemption.id,
      path: `/lojas/${event.storeId}/tickets/${event.redemption.id}${transition ? `?evento=${transition.id}` : ''}` };
  }
  if (['SUBMISSION_RECEIVED', 'SUBMISSION_REVIEWED', 'SUBMISSION_RESPONDED'].includes(event.kind)) {
    if (!event.submission || event.submission.status === 'DRAFT') unavailable();
    return { ...common, type: 'submission', subjectId: event.submission.id,
      path: `/lojas/${event.storeId}/registros/${event.submission.id}${event.reviewEvent ? `?evento=${event.reviewEvent.id}` : ''}` };
  }
  const conversation = event.kind === 'REACTION_CHANGED' ? event.reactionEvent?.conversation : event.comment?.conversation;
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
