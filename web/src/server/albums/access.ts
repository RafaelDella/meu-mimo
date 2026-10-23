import '../only.ts';
import type { MediaCollection, Redemption, TicketAlbum } from '../../generated/prisma/client.ts';
import { requireConversationAudience } from '../conversations/access.ts';
import type { StoreScope } from '../stores/transaction.ts';
import { requireMembership } from '../stores/transaction.ts';
import { unavailable } from '../stores/validation.ts';

/** A coleção só é um endereço; sua origem e autoria continuam obrigatórias. */
export async function requireAlbumOrigin(scope: StoreScope, collection: MediaCollection): Promise<{
  album: TicketAlbum; ticket: Redemption;
}> {
  if (collection.purpose !== 'MEMORY' || collection.storeId !== scope.store.id) unavailable();
  const album = await scope.tx.ticketAlbum.findUnique({ where: { collectionId: collection.id } });
  if (!album || album.storeId !== scope.store.id || album.redemptionId !== collection.subjectId ||
      album.participantMembershipId !== collection.participantMembershipId) unavailable();
  const ticket = await scope.tx.redemption.findFirst({ where: { id: album.redemptionId,
    storeId: scope.store.id, participantMembershipId: album.participantMembershipId } });
  const merchant = await scope.tx.membership.findFirst({ where: { storeId: scope.store.id,
    role: 'MERCHANT', profileId: album.createdByProfileId, accessRevokedAt: null } });
  if (!ticket || !merchant) unavailable();
  await requireConversationAudience(scope, ticket.participantMembershipId);
  return { album, ticket };
}

/** Encerramento preserva autoria; revogação continua negando o acesso. */
export function requireAlbumAuthor(scope: StoreScope, album?: TicketAlbum): void {
  const actor = requireMembership(scope);
  if (actor.role !== 'MERCHANT' || actor.profileId !== scope.identity.userId ||
      (album && album.createdByProfileId !== actor.profileId)) unavailable();
}
