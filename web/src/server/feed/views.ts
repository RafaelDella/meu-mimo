import '../only.ts';
import type { FeedItem } from '../../contracts/feed.ts';
import { albumPreview } from '../albums/views.ts';
import { requireConversationAccess } from '../conversations/access.ts';
import { reactionState } from '../reactions/views.ts';
import type { StoreScope } from '../stores/transaction.ts';
import { databaseNow } from '../stores/transaction.ts';
import { unavailable } from '../stores/validation.ts';
import type { FeedAddress } from './queries.ts';

async function evidencePreview(scope: StoreScope, submissionId: string, assetId: string | null) {
  if (!assetId) return null;
  const asset = await scope.tx.mediaAsset.findFirst({ where: { id: assetId, state: 'READY', removedAt: null,
    publishedAt: { not: null }, collection: { purpose: 'EVIDENCE', storeId: scope.store.id, subjectId: submissionId } },
  include: { collection: { select: { retentionHold: true } } } });
  if (!asset || (!asset.collection.retentionHold && asset.publishedAt!.getTime() <=
      (await databaseNow(scope.tx)).getTime() - 180 * 86_400_000)) return null;
  return { assetId: asset.id, mediaType: asset.mediaType };
}

export async function feedItem(scope: StoreScope, address: FeedAddress): Promise<FeedItem> {
  const conversation = await requireConversationAccess(scope, address.conversationId);
  if (conversation.subjectType !== address.subjectType || conversation.subjectId !== address.id) unavailable();
  const participant = await scope.tx.membership.findUniqueOrThrow({ where: { id: conversation.participantMembershipId },
    select: { profile: { select: { displayName: true } } } });
  const base = { id: `${address.subjectType}:${address.id}`, subjectType: address.subjectType, subjectId: address.id,
    storeId: scope.store.id, participantMembershipId: conversation.participantMembershipId, participant: participant.profile,
    occurredAt: address.occurredAt.toISOString(), conversationId: conversation.id,
    reactions: await reactionState(scope, conversation) };
  if (address.subjectType === 'SUBMISSION') {
    const submission = await scope.tx.activitySubmission.findFirst({ where: { id: address.id, storeId: scope.store.id,
      participantMembershipId: conversation.participantMembershipId, receivedAt: { not: null }, status: { not: 'DRAFT' } } });
    if (!submission || submission.status === 'DRAFT') unavailable();
    const preview = await evidencePreview(scope, submission.id, submission.evidenceAssetId);
    return { ...base, name: submission.activityName!, status: submission.status, summary: submission.caption,
      path: `/lojas/${scope.store.id}/registros/${submission.id}`, preview, publishedMediaCount: preview ? 1 : 0 };
  }
  const ticket = await scope.tx.redemption.findFirst({ where: { id: address.id, storeId: scope.store.id,
    participantMembershipId: conversation.participantMembershipId } });
  if (!ticket) unavailable();
  const album = await albumPreview(scope, ticket.id);
  const asset = album.thumbnailAssetId ? await scope.tx.mediaAsset.findUnique({ where: { id: album.thumbnailAssetId },
    select: { id: true, mediaType: true } }) : null;
  return { ...base, name: ticket.rewardName, status: ticket.status, summary: ticket.agreementText || ticket.rewardDescription,
    path: `/lojas/${scope.store.id}/tickets/${ticket.id}`, publishedMediaCount: album.publishedCount,
    preview: asset ? { assetId: asset.id, mediaType: asset.mediaType } : null };
}
