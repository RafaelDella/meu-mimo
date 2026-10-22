import '../only.ts';
import type { Prisma } from '../../generated/prisma/client.ts';
import type { StoreTransaction } from '../stores/transaction.ts';
import { operationConflict, resourceId, unavailable } from '../stores/validation.ts';

type EventInput = Pick<Prisma.OutboxEventUncheckedCreateInput,
  'key' | 'kind' | 'storeId' | 'participantMembershipId' | 'actorProfileId' |
  'recipientMembershipId' | 'invitationId' | 'commentId'>;

async function persistEvent(tx: StoreTransaction, input: EventInput): Promise<void> {
  // A unicidade também cobre duas transações que chegaram aqui ao mesmo tempo.
  await tx.outboxEvent.createMany({ data: input, skipDuplicates: true });
  const existing = await tx.outboxEvent.findUnique({ where: { key: input.key } });
  if (!existing || existing.kind !== input.kind || existing.storeId !== input.storeId ||
      existing.participantMembershipId !== input.participantMembershipId ||
      existing.actorProfileId !== input.actorProfileId || existing.recipientMembershipId !== input.recipientMembershipId ||
      existing.invitationId !== (input.invitationId ?? null) || existing.commentId !== (input.commentId ?? null)) operationConflict();
}

async function audience(tx: StoreTransaction, storeId: string, participantMembershipId: string) {
  const participant = await tx.membership.findFirst({ where: {
    id: participantMembershipId, storeId, role: 'PARTICIPANT', accessRevokedAt: null,
  }, select: { id: true, profileId: true } });
  const merchant = await tx.membership.findFirst({ where: {
    storeId, role: 'MERCHANT', accessRevokedAt: null, closedAt: null,
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
