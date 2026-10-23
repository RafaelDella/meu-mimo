import '../only.ts';
import type { FeedItem } from '../../contracts/feed.ts';
import { albumPreview } from '../albums/views.ts';
import { requireConversationAccess } from '../conversations/access.ts';
import { reactionState } from '../reactions/views.ts';
import type { StoreScope } from '../stores/transaction.ts';
import { databaseNow } from '../stores/transaction.ts';
import { unavailable } from '../stores/validation.ts';
import type { FeedAddress } from './queries.ts';
import { visibleMediaAuthor } from '../privacy/suppression.ts';
import type { Suppressions } from '../privacy/suppression.ts';
import { publicAuthor, visibleAuthoredText } from '../privacy/views.ts';

async function evidencePreview(scope: StoreScope, submissionId: string, assetId: string | null) {
  if (!assetId) return null;
  const asset = await scope.tx.mediaAsset.findFirst({ where: { id: assetId, state: 'READY', removedAt: null, author: visibleMediaAuthor,
    publishedAt: { not: null }, collection: { purpose: 'EVIDENCE', storeId: scope.store.id, subjectId: submissionId } },
  include: { collection: { select: { retentionHold: true } } } });
  if (!asset || (!asset.collection.retentionHold && asset.publishedAt!.getTime() <=
      (await databaseNow(scope.tx)).getTime() - 180 * 86_400_000)) return null;
  return { assetId: asset.id, mediaType: asset.mediaType };
}

export async function feedItem(scope: StoreScope, address: FeedAddress, suppressions: Suppressions): Promise<FeedItem> {
  const conversation = await requireConversationAccess(scope, address.conversationId);
  if (conversation.subjectType !== address.subjectType || conversation.subjectId !== address.id) unavailable();
  const participant = await scope.tx.membership.findUniqueOrThrow({ where: { id: conversation.participantMembershipId },
    select: { profileId: true, profile: { select: { displayName: true } } } });
  const base = { id: `${address.subjectType}:${address.id}`, subjectType: address.subjectType, subjectId: address.id,
    storeId: scope.store.id, participantMembershipId: conversation.participantMembershipId,
    participant: publicAuthor(participant.profile, suppressions.get(participant.profileId)),
    occurredAt: address.occurredAt.toISOString(), conversationId: conversation.id,
    reactions: await reactionState(scope, conversation, suppressions) };
  if (address.subjectType === 'SUBMISSION') {
    const submission = await scope.tx.activitySubmission.findFirst({ where: { id: address.id, storeId: scope.store.id,
      participantMembershipId: conversation.participantMembershipId, receivedAt: { not: null }, status: { not: 'DRAFT' } },
      include: { activity: { select: { createdByProfileId: true } } } });
    if (!submission || submission.status === 'DRAFT') unavailable();
    const preview = await evidencePreview(scope, submission.id, submission.evidenceAssetId);
    return { ...base, name: visibleAuthoredText(submission.activityName!, submission.activity.createdByProfileId, suppressions),
      status: submission.status, summary: visibleAuthoredText(submission.caption, submission.authorProfileId, suppressions),
      path: `/lojas/${scope.store.id}/registros/${submission.id}`, preview, publishedMediaCount: preview ? 1 : 0 };
  }
  const ticket = await scope.tx.redemption.findFirst({ where: { id: address.id, storeId: scope.store.id,
    participantMembershipId: conversation.participantMembershipId }, include: { reward: { select: { createdByProfileId: true } },
      events: { where: { kind: 'AGREE' }, orderBy: { version: 'desc' }, take: 1, select: { actorProfileId: true } } } });
  if (!ticket) unavailable();
  const album = await albumPreview(scope, ticket.id);
  const asset = album.thumbnailAssetId ? await scope.tx.mediaAsset.findUnique({ where: { id: album.thumbnailAssetId },
    select: { id: true, mediaType: true } }) : null;
  const agreement = ticket.events[0];
  return { ...base, name: visibleAuthoredText(ticket.rewardName, ticket.reward.createdByProfileId, suppressions), status: ticket.status,
    summary: ticket.agreementText && agreement ? visibleAuthoredText(ticket.agreementText, agreement.actorProfileId, suppressions) :
      visibleAuthoredText(ticket.rewardDescription, ticket.reward.createdByProfileId, suppressions),
    path: `/lojas/${scope.store.id}/tickets/${ticket.id}`, publishedMediaCount: album.publishedCount,
    preview: asset ? { assetId: asset.id, mediaType: asset.mediaType } : null };
}
