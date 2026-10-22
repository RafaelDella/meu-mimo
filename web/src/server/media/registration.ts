import '../only.ts';
import type { MediaCollection } from '../../generated/prisma/client.ts';
import type { MediaAssetView, MediaPurpose } from '../../contracts/media.ts';
import { requireConversationAudience } from '../conversations/access.ts';
import { requireAlbumAuthor, requireAlbumOrigin } from '../albums/access.ts';
import { requireTicket } from '../redemptions/access.ts';
import { AppError } from '../errors.ts';
import type { StoreScope } from '../stores/transaction.ts';
import { databaseNow } from '../stores/transaction.ts';
import { invalidField, operationConflict, resourceId, unavailable } from '../stores/validation.ts';
import { assertMediaUpload, requireMediaCollection } from './access.ts';
import { mediaAssetView } from './views.ts';

/** A origem validada registra a coleção dentro da própria transação. Não é uma API pública. */
export async function registerMediaCollection(scope: StoreScope, input: {
  purpose: MediaPurpose; subjectId: string; participantMembershipId: string;
}): Promise<MediaCollection> {
  if (!['EVIDENCE', 'MEMORY'].includes(input.purpose)) invalidField();
  const subjectId = resourceId(input.subjectId);
  const participant = await requireConversationAudience(scope, input.participantMembershipId);
  if (input.purpose === 'MEMORY') {
    requireAlbumAuthor(scope);
    const ticket = await requireTicket(scope, subjectId);
    if (ticket.participantMembershipId !== participant.id) unavailable();
  }
  const key = `meumimo:t06:media-subject:${input.purpose}:${subjectId}`;
  await scope.tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
  const existing = await scope.tx.mediaCollection.findUnique({
    where: { purpose_subjectId: { purpose: input.purpose, subjectId } },
  });
  if (existing) {
    if (existing.storeId !== scope.store.id || existing.participantMembershipId !== participant.id) operationConflict();
    if (existing.purpose === 'MEMORY') await requireAlbumOrigin(scope, existing);
    return existing;
  }
  return scope.tx.mediaCollection.create({ data: { storeId: scope.store.id,
    participantMembershipId: participant.id, purpose: input.purpose, subjectId } });
}

/** O módulo da origem confirma a anexação/publicação e suas regras de negócio na mesma transação. */
export async function publishMedia(scope: StoreScope, collectionId: string, assetIds: string[],
  publishedAt?: Date): Promise<MediaAssetView[]> {
  if (!Array.isArray(assetIds) || !assetIds.length || assetIds.length > 20 || assetIds.some(id => typeof id !== 'string')) invalidField();
  const ids = assetIds.map(resourceId);
  if (new Set(ids).size !== ids.length) invalidField();
  const context = await requireMediaCollection(scope, collectionId);
  const assets = await scope.tx.mediaAsset.findMany({ where: { id: { in: ids }, collectionId: context.collection.id } });
  if (assets.length !== ids.length) unavailable();
  const now = publishedAt ?? await databaseNow(scope.tx);
  const result = new Map<string, MediaAssetView>();
  for (const asset of assets) {
    if (asset.removedAt || asset.state !== 'READY' || !asset.outputVersion ||
        !asset.displayBytes || !asset.thumbnailBytes || !asset.width || !asset.height) {
      throw new AppError('media_not_ready', 409, 'Aguarde o processamento de todos os arquivos escolhidos.');
    }
    if (asset.publishedAt) { result.set(asset.id, mediaAssetView(asset)); continue; }
    assertMediaUpload(context, asset);
    const published = await scope.tx.mediaAsset.update({ where: { id: asset.id }, data: { publishedAt: now, lastActivityAt: now } });
    result.set(asset.id, mediaAssetView(published));
  }
  return ids.map(id => result.get(id)!);
}

/** Apenas a origem abre um complemento; nenhum arquivo anterior é apagado ou reaproveitado. */
export async function nextEvidenceRevision(scope: StoreScope, collectionId: string): Promise<MediaCollection> {
  const context = await requireMediaCollection(scope, collectionId);
  if (context.collection.purpose !== 'EVIDENCE') invalidField();
  const participant = await requireConversationAudience(scope, context.collection.participantMembershipId);
  if ((scope.store.state !== 'ACTIVE' && !context.allowPausedEvidence) ||
      participant.closedAt || context.collection.revision >= 2_147_483_647) {
    throw new AppError('media_read_only', 409, 'Este registro não pode receber uma nova foto agora.');
  }
  return scope.tx.mediaCollection.update({ where: { id: context.collection.id },
    data: { revision: { increment: 1 }, uploadsClosedAt: null } });
}
