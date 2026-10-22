import '../only.ts';
import type { Redemption } from '../../generated/prisma/client.ts';
import { memoryRetentionUntil, setOriginMediaRetention } from '../media/retention.ts';
import type { StoreScope } from '../stores/transaction.ts';
import { databaseNow } from '../stores/transaction.ts';
import { unavailable } from '../stores/validation.ts';

/** Consulta o estado transacional atual, inclusive após encerramento na mesma transação. */
export async function albumRetention(scope: StoreScope, ticket: Redemption, now: Date): Promise<{
  closedAt: Date | null; until: Date | null; hold: boolean; expired: boolean;
}> {
  const store = await scope.tx.store.findUnique({ where: { id: scope.store.id }, select: { closedAt: true } });
  const participant = await scope.tx.membership.findFirst({ where: { id: ticket.participantMembershipId,
    storeId: scope.store.id, role: 'PARTICIPANT' }, select: { closedAt: true } });
  if (!store || !participant || ticket.storeId !== scope.store.id) unavailable();
  const dates = [store.closedAt, participant.closedAt].filter((date): date is Date => date !== null);
  const closedAt = dates.length ? new Date(Math.min(...dates.map(date => date.getTime()))) : null;
  const until = memoryRetentionUntil(closedAt);
  const hold = !['FULFILLED', 'CANCELLED'].includes(ticket.status);
  return { closedAt, until, hold, expired: until !== null && until.getTime() <= now.getTime() };
}

/** Não abre transação: origem, projeção e prazo confirmam ou revertem juntos. */
export async function syncAlbumRetention(scope: StoreScope,
  input: { ticketId?: string; membershipId?: string } = {}): Promise<void> {
  const albums = await scope.tx.ticketAlbum.findMany({ where: { storeId: scope.store.id,
    ...(input.ticketId ? { redemptionId: input.ticketId } : {}),
    ...(input.membershipId ? { participantMembershipId: input.membershipId } : {}) },
  orderBy: { collectionId: 'asc' }, include: { redemption: true, collection: true } });
  const now = await databaseNow(scope.tx);
  for (const album of albums) {
    if (album.collection.purpose !== 'MEMORY' || album.collection.storeId !== scope.store.id ||
        album.collection.subjectId !== album.redemptionId || album.redemption.storeId !== scope.store.id ||
        album.collection.participantMembershipId !== album.participantMembershipId ||
        album.redemption.participantMembershipId !== album.participantMembershipId) unavailable();
    const policy = await albumRetention(scope, album.redemption, now);
    await setOriginMediaRetention(scope, album.collection, { hold: policy.hold, closedAt: policy.closedAt });
  }
}
