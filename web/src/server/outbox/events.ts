import '../only.ts';
import type { Prisma } from '../../generated/prisma/client.ts';
import type { StoreTransaction } from '../stores/transaction.ts';
import { operationConflict, resourceId, unavailable } from '../stores/validation.ts';

type EventInput = Pick<Prisma.OutboxEventUncheckedCreateInput,
  'key' | 'kind' | 'storeId' | 'participantMembershipId' | 'actorProfileId' |
  'recipientMembershipId' | 'invitationId' | 'commentId' | 'submissionId' | 'reviewEventId' | 'redemptionId' | 'redemptionEventId' | 'albumEventId' | 'noteVersionId' | 'reactionEventId'>;

async function persistEvent(tx: StoreTransaction, input: EventInput): Promise<void> {
  // A unicidade também cobre duas transações que chegaram aqui ao mesmo tempo.
  await tx.outboxEvent.createMany({ data: input, skipDuplicates: true });
  const existing = await tx.outboxEvent.findUnique({ where: { key: input.key } });
  if (!existing || existing.kind !== input.kind || existing.storeId !== input.storeId ||
      existing.participantMembershipId !== input.participantMembershipId ||
      existing.actorProfileId !== input.actorProfileId || existing.recipientMembershipId !== input.recipientMembershipId ||
      existing.invitationId !== (input.invitationId ?? null) || existing.commentId !== (input.commentId ?? null) ||
      existing.submissionId !== (input.submissionId ?? null) ||
      existing.reviewEventId !== (input.reviewEventId ?? null) ||
      existing.redemptionId !== (input.redemptionId ?? null) ||
      existing.redemptionEventId !== (input.redemptionEventId ?? null) ||
      existing.albumEventId !== (input.albumEventId ?? null) ||
      existing.noteVersionId !== (input.noteVersionId ?? null) ||
      existing.reactionEventId !== (input.reactionEventId ?? null)) operationConflict();
}

async function audience(tx: StoreTransaction, storeId: string, participantMembershipId: string, allowClosedMerchant = false) {
  const participant = await tx.membership.findFirst({ where: {
    id: participantMembershipId, storeId, role: 'PARTICIPANT', accessRevokedAt: null,
  }, select: { id: true, profileId: true } });
  const merchant = await tx.membership.findFirst({ where: {
    storeId, role: 'MERCHANT', accessRevokedAt: null, ...(!allowClosedMerchant ? { closedAt: null } : {}),
  }, select: { id: true, profileId: true } });
  if (!participant || !merchant || participant.profileId === merchant.profileId) unavailable();
  return { participant, merchant };
}

/** Chamado pelo produtor na mesma transação do primeiro aceite confirmado. */
export async function enqueueInvitationAccepted(tx: StoreTransaction, invitationId: string): Promise<void> {
  const id = resourceId(invitationId);
  const invitation = await tx.invitation.findUnique({ where: { id }, select: {
    id: true, storeId: true, acceptedAt: true, acceptedByProfileId: true, acceptedMembershipId: true,
  } });
  if (!invitation?.acceptedAt || !invitation.acceptedByProfileId || !invitation.acceptedMembershipId) unavailable();
  const { participant, merchant } = await audience(tx, invitation.storeId, invitation.acceptedMembershipId);
  if (participant.profileId !== invitation.acceptedByProfileId) unavailable();
  await persistEvent(tx, {
    key: `invitation.accepted:${id}`, kind: 'INVITATION_ACCEPTED', storeId: invitation.storeId,
    participantMembershipId: participant.id, actorProfileId: participant.profileId,
    recipientMembershipId: merchant.id, invitationId: id, commentId: null,
  });
}

/** Não aceita destinatário nem audiência provenientes do navegador. */
export async function enqueueCommentCreated(tx: StoreTransaction, commentId: string): Promise<void> {
  const id = resourceId(commentId);
  const comment = await tx.comment.findUnique({ where: { id }, select: {
    id: true, conversationId: true, authorProfileId: true,
  } });
  if (!comment) unavailable();
  const conversation = await tx.conversation.findUnique({ where: { id: comment.conversationId }, select: {
    storeId: true, participantMembershipId: true,
  } });
  if (!conversation) unavailable();
  const { participant, merchant } = await audience(tx, conversation.storeId, conversation.participantMembershipId);
  const recipient = comment.authorProfileId === participant.profileId ? merchant :
    comment.authorProfileId === merchant.profileId ? participant : null;
  if (!recipient || recipient.profileId === comment.authorProfileId) unavailable();
  await persistEvent(tx, {
    key: `comment.created:${id}`, kind: 'COMMENT_CREATED', storeId: conversation.storeId,
    participantMembershipId: participant.id, actorProfileId: comment.authorProfileId,
    recipientMembershipId: recipient.id, invitationId: null, commentId: id,
  });
}

/** Recebimento real, crédito e novidade pertencem à mesma transação da origem. */
export async function enqueueSubmissionReceived(tx: StoreTransaction, submissionId: string): Promise<void> {
  const id = resourceId(submissionId);
  const submission = await tx.activitySubmission.findUnique({ where: { id }, select: {
    storeId: true, status: true, participantMembershipId: true, authorProfileId: true, receivedAt: true,
  } });
  if (!submission?.receivedAt || submission.status === 'DRAFT') unavailable();
  const { participant, merchant } = await audience(tx, submission.storeId, submission.participantMembershipId);
  if (submission.authorProfileId !== participant.profileId) unavailable();
  await persistEvent(tx, { key: `submission.received:${id}`, kind: 'SUBMISSION_RECEIVED',
    storeId: submission.storeId, participantMembershipId: participant.id,
    actorProfileId: participant.profileId, recipientMembershipId: merchant.id,
    submissionId: id, invitationId: null, commentId: null });
}

/** Cada decisão ou complemento entrega apenas um aviso à outra pessoa da origem. */
export async function enqueueSubmissionReview(tx: StoreTransaction, eventId: string): Promise<void> {
  const id = resourceId(eventId);
  const event = await tx.submissionReviewEvent.findUnique({ where: { id }, include: { submission: true } });
  if (!event || !event.submission.receivedAt || event.submission.status === 'DRAFT') unavailable();
  const { participant, merchant } = await audience(tx, event.storeId, event.submission.participantMembershipId);
  const responding = event.action === 'RESPOND';
  if (event.actorProfileId !== (responding ? participant.profileId : merchant.profileId)) unavailable();
  await persistEvent(tx, { key: `submission.review:${id}`,
    kind: responding ? 'SUBMISSION_RESPONDED' : 'SUBMISSION_REVIEWED', storeId: event.storeId,
    participantMembershipId: participant.id, actorProfileId: event.actorProfileId,
    recipientMembershipId: responding ? merchant.id : participant.id,
    submissionId: event.submissionId, reviewEventId: id, invitationId: null, commentId: null });
}

/** O ticket, seu débito e este aviso confirmam juntos; não aceita destinatário do cliente. */
export async function enqueueRedemptionIssued(tx: StoreTransaction, redemptionId: string): Promise<void> {
  const id = resourceId(redemptionId);
  const ticket = await tx.redemption.findUnique({ where: { id } });
  if (!ticket) unavailable();
  const { participant, merchant } = await audience(tx, ticket.storeId, ticket.participantMembershipId);
  if (ticket.authorProfileId !== participant.profileId) unavailable();
  await persistEvent(tx, { key: `redemption.issued:${id}`, kind: 'REDEMPTION_ISSUED',
    storeId: ticket.storeId, participantMembershipId: participant.id, actorProfileId: participant.profileId,
    recipientMembershipId: merchant.id, redemptionId: ticket.id });
}

/** Estado, evento, eventual devolução e aviso têm o mesmo resultado transacional. */
export async function enqueueRedemptionUpdated(tx: StoreTransaction, eventId: string): Promise<void> {
  const id = resourceId(eventId);
  const event = await tx.redemptionEvent.findUnique({ where: { id }, include: { redemption: true } });
  if (!event || event.kind === 'ISSUED') unavailable();
  const ticket = event.redemption;
  const { participant, merchant } = await audience(tx, ticket.storeId, ticket.participantMembershipId, true);
  const requesting = event.kind === 'REQUEST_CANCELLATION';
  const author = requesting ? participant : merchant;
  const recipient = requesting ? merchant : participant;
  if (author.profileId !== event.actorProfileId || author.profileId === recipient.profileId) unavailable();
  await persistEvent(tx, { key: `redemption.updated:${id}`, kind: 'REDEMPTION_UPDATED',
    storeId: ticket.storeId, participantMembershipId: participant.id, actorProfileId: author.profileId,
    recipientMembershipId: recipient.id, redemptionId: ticket.id, redemptionEventId: id });
}

/** Uma publicação explícita gera uma única novidade para o participante do ticket. */
export async function enqueueAlbumPublished(tx: StoreTransaction, eventId: string): Promise<void> {
  const id = resourceId(eventId);
  const event = await tx.albumEvent.findUnique({ where: { id }, include: { redemption: true, album: true } });
  if (!event || event.kind !== 'PUBLISH' || event.album.redemptionId !== event.redemptionId ||
      event.album.createdByProfileId !== event.actorProfileId) unavailable();
  const ticket = event.redemption;
  const { participant, merchant } = await audience(tx, ticket.storeId, ticket.participantMembershipId, true);
  if (event.actorProfileId !== merchant.profileId) unavailable();
  await persistEvent(tx, { key: `album.published:${id}`, kind: 'ALBUM_PUBLISHED', storeId: ticket.storeId,
    participantMembershipId: participant.id, actorProfileId: merchant.profileId, recipientMembershipId: participant.id,
    redemptionId: ticket.id, albumEventId: id });
}

/** O envio privado é entregue à própria participação; o texto não é copiado. */
export async function enqueueNoteSent(tx: StoreTransaction, versionId: string): Promise<void> {
  const id = resourceId(versionId);
  const version = await tx.noteVersion.findUnique({ where: { id } });
  if (!version) unavailable();
  const { participant, merchant } = await audience(tx, version.storeId, version.participantMembershipId, true);
  if (version.actorProfileId !== merchant.profileId) unavailable();
  await persistEvent(tx, { key: `note.sent:${id}`, kind: 'NOTE_SENT', storeId: version.storeId,
    participantMembershipId: participant.id, actorProfileId: merchant.profileId,
    recipientMembershipId: participant.id, noteVersionId: id });
}

/** Apenas adição/troca efetiva gera aviso. Remoção e noop conservam só auditoria. */
export async function enqueueReactionChanged(tx: StoreTransaction, eventId: string): Promise<void> {
  const id = resourceId(eventId);
  const event = await tx.reactionEvent.findUnique({ where: { id }, include: { conversation: true } });
  if (!event || event.toEmoji === null || event.toEmoji === event.fromEmoji ||
      event.storeId !== event.conversation.storeId) unavailable();
  const { participant, merchant } = await audience(tx, event.storeId, event.conversation.participantMembershipId, true);
  const recipient = event.actorProfileId === participant.profileId ? merchant :
    event.actorProfileId === merchant.profileId ? participant : null;
  if (!recipient || recipient.profileId === event.actorProfileId) unavailable();
  await persistEvent(tx, { key: `reaction.changed:${id}`, kind: 'REACTION_CHANGED', storeId: event.storeId,
    participantMembershipId: participant.id, actorProfileId: event.actorProfileId,
    recipientMembershipId: recipient.id, reactionEventId: id });
}
