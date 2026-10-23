import '../only.ts';
import type { Prisma } from '../../generated/prisma/client.ts';
import type { DashboardEvent } from '../../contracts/dashboards.ts';
import type { TicketSummary } from '../../contracts/redemptions.ts';
import type { PageResult } from '../../contracts/stores.ts';
import { requireConversationAudience } from '../conversations/access.ts';
import { notificationSelect, notificationTarget } from '../notifications/queries.ts';
import type { StoreScope } from '../stores/transaction.ts';
import { requireMembership } from '../stores/transaction.ts';
import { pagination } from '../stores/validation.ts';
import { suppressionFor } from '../privacy/suppression.ts';
import { publicAuthor } from '../privacy/views.ts';

export const openTicketStatuses = ['WAITING_AGREEMENT', 'AGREED', 'CANCELLATION_REQUESTED'] as const;

export function ticketWhere(scope: StoreScope, membershipId?: string): Prisma.RedemptionWhereInput {
  return { storeId: scope.store.id, participant: { role: 'PARTICIPANT', accessRevokedAt: null },
    ...(membershipId ? { participantMembershipId: membershipId } : {}) };
}

export function pendingWhere(scope: StoreScope, membershipId?: string): Prisma.ActivitySubmissionWhereInput {
  return { storeId: scope.store.id, participant: { role: 'PARTICIPANT', accessRevokedAt: null },
    ...(membershipId ? { participantMembershipId: membershipId } : {}),
    status: { in: ['PENDING', 'CONTESTED'] }, receivedAt: { not: null } };
}

export async function ticketSummary(scope: StoreScope, membershipId: string): Promise<TicketSummary> {
  await requireConversationAudience(scope, membershipId);
  const where = ticketWhere(scope, membershipId);
  return { total: await scope.tx.redemption.count({ where }), outstanding: await scope.tx.redemption.count({
    where: { ...where, status: { in: [...openTicketStatuses] } },
  }) };
}

/** Só fontes entregues; nunca consulta NoteRead ou conteúdo dos bilhetes. */
export async function dashboardEvents(scope: StoreScope, query: URLSearchParams): Promise<PageResult<DashboardEvent>> {
  const actor = requireMembership(scope);
  const page = pagination(query);
  const where: Prisma.NotificationWhereInput = { event: { storeId: scope.store.id,
    participantMembership: { role: 'PARTICIPANT', accessRevokedAt: null },
    recipientMembership: { accessRevokedAt: null },
    ...(actor.role === 'PARTICIPANT' ? { participantMembershipId: actor.id } : {}) } };
  const total = await scope.tx.notification.count({ where });
  const rows = await scope.tx.notification.findMany({ where, select: { ...notificationSelect,
    event: { select: { ...notificationSelect.event.select,
      participantMembership: { select: { profileId: true, profile: { select: { displayName: true } } } } } } },
  orderBy: [{ event: { createdAt: 'desc' } }, { id: 'desc' }], skip: page.skip, take: page.pageSize });
  const items: DashboardEvent[] = [];
  const suppressions = await suppressionFor(scope.tx, rows.flatMap(row => [row.event.actorProfileId, row.event.participantMembership.profileId]));
  for (const row of rows) {
    await requireConversationAudience(scope, row.event.participantMembershipId);
    const target = await notificationTarget(row, scope.tx);
    items.push({ id: row.id, kind: row.event.kind, occurredAt: row.event.createdAt.toISOString(),
      path: target.path ?? `/lojas/${scope.store.id}/mural`, author: publicAuthor(row.event.actor, suppressions.get(row.event.actorProfileId)),
      participant: publicAuthor(row.event.participantMembership.profile, suppressions.get(row.event.participantMembership.profileId)) });
  }
  return { items, total, page: page.page, pageSize: page.pageSize };
}
