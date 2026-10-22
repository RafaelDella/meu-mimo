import '../only.ts';
import { randomUUID } from 'node:crypto';
import { digest } from '../activities/validation.ts';
import { AppError } from '../errors.ts';
import type { MediaAssetScope } from '../media/access.ts';
import { requireAlbumAuthor, requireAlbumOrigin } from './access.ts';

/** A remoção de rascunho também muda a revisão e deixa evidência autoral. */
export async function recordAlbumRemoval(scope: MediaAssetScope, now: Date): Promise<void> {
  if (scope.collection.purpose !== 'MEMORY' || scope.asset.removedAt) return;
  const { album } = await requireAlbumOrigin(scope, scope.collection);
  requireAlbumAuthor(scope, album);
  if (album.version >= 2_147_483_647) throw new AppError('album_changed', 409, 'Este álbum atingiu o limite de revisões.');
  await scope.tx.$queryRaw`SELECT id FROM app."TicketAlbum" WHERE id=${album.id}::uuid FOR UPDATE`;
  await scope.tx.albumEvent.create({ data: { id: randomUUID(), albumId: album.id, storeId: album.storeId,
    redemptionId: album.redemptionId, actorProfileId: scope.identity.userId, version: album.version + 1,
    kind: 'REMOVE', removedAssetId: scope.asset.id, requestDigest: digest({ assetId: scope.asset.id }), createdAt: now } });
  await scope.tx.ticketAlbum.update({ where: { id: album.id }, data: { version: { increment: 1 } } });
}
