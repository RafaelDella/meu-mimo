import '../only.ts';
import type { Prisma, Redemption } from '../../generated/prisma/client.ts';
import type { AlbumPreview, TicketAlbumPage } from '../../contracts/albums.ts';
import type { StoreScope } from '../stores/transaction.ts';
import { databaseNow, requireMembership } from '../stores/transaction.ts';
import { pagination } from '../stores/validation.ts';
import { albumRetention } from './retention.ts';
import { requireAlbumOrigin } from './access.ts';
import { visibleMediaAuthor } from '../privacy/suppression.ts';

async function validateOrigin(scope: StoreScope, collectionId: string) {
  const collection = await scope.tx.mediaCollection.findUniqueOrThrow({ where: { id: collectionId } });
  return requireAlbumOrigin(scope, collection);
}

function visibleItems(albumId: string): Prisma.AlbumItemWhereInput {
  return { albumId, asset: { removedAt: null, state: 'READY', publishedAt: { not: null }, author: visibleMediaAuthor },
    publication: { actor: { dataSuppressions: { none: { scope: 'AUTHORED_CONTENT' } } } } };
}

export async function albumPreview(scope: StoreScope, ticketId: string): Promise<AlbumPreview> {
  const album = await scope.tx.ticketAlbum.findUnique({ where: { redemptionId: ticketId }, include: { redemption: true } });
  if (!album || album.storeId !== scope.store.id) return { publishedCount: 0, thumbnailAssetId: null };
  await validateOrigin(scope, album.collectionId);
  const policy = await albumRetention(scope, album.redemption, await databaseNow(scope.tx));
  if (policy.expired && !policy.hold) return { publishedCount: 0, thumbnailAssetId: null };
  const where = visibleItems(album.id);
  const publishedCount = await scope.tx.albumItem.count({ where });
  const thumbnail = await scope.tx.albumItem.findFirst({ where, orderBy: { position: 'asc' }, select: { assetId: true } });
  return { publishedCount, thumbnailAssetId: thumbnail?.assetId ?? null };
}

export async function albumPage(scope: StoreScope, ticket: Redemption,
  query = new URLSearchParams()): Promise<TicketAlbumPage> {
  const page = pagination(query);
  const actor = requireMembership(scope);
  const album = await scope.tx.ticketAlbum.findUnique({ where: { redemptionId: ticket.id } });
  if (album) await validateOrigin(scope, album.collectionId);
  const policy = await albumRetention(scope, ticket, await databaseNow(scope.tx));
  const author = actor.role === 'MERCHANT' && (!album || album.createdByProfileId === actor.profileId);
  const writable = author && ticket.status !== 'CANCELLED' && !policy.expired;
  const where: Prisma.AlbumItemWhereInput = album && !(policy.expired && !policy.hold)
    ? visibleItems(album.id) : { assetId: { in: [] } };
  const total = album ? await scope.tx.albumItem.count({ where }) : 0;
  const rows = album ? await scope.tx.albumItem.findMany({ where, include: { asset: true },
    orderBy: { position: 'asc' }, skip: page.skip, take: page.pageSize }) : [];
  return { id: album?.id ?? null, storeId: scope.store.id, ticketId: ticket.id, version: album?.version ?? 0,
    collectionId: author ? album?.collectionId ?? null : null,
    permissions: { canStart: writable && !album, canUpload: writable && !!album, canPublish: writable && !!album },
    unavailableReason: policy.expired ? 'RETENTION_EXPIRED' : ticket.status === 'CANCELLED' ? 'CANCELLED' : null,
    total, page: page.page, pageSize: page.pageSize, items: rows.map(row => ({ assetId: row.assetId,
      caption: row.caption, position: row.position, publishedAt: row.asset.publishedAt!.toISOString(),
      mediaType: row.asset.mediaType, width: row.asset.width!, height: row.asset.height!,
      durationMs: row.asset.durationMs, canRemove: author && row.asset.authorProfileId === scope.identity.userId })) };
}
