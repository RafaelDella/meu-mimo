import '../only.ts';
import type { Redemption } from '../../generated/prisma/client.ts';
import type { TicketAction, TicketCancellationImpact, TicketStatus } from '../../contracts/redemptions.ts';
import { AppError } from '../errors.ts';
import { availablePoints } from '../points/ledger.ts';
import type { StoreScope } from '../stores/transaction.ts';
import { requireMembership } from '../stores/transaction.ts';
import { unavailable } from '../stores/validation.ts';

const open = ['WAITING_AGREEMENT', 'AGREED'];

export function ticketActions(scope: StoreScope, ticket: Redemption): TicketAction[] {
  const actor = requireMembership(scope);
  if (ticket.version >= 2_147_483_647) return [];
  if (actor.role === 'PARTICIPANT') return open.includes(ticket.status) ? ['REQUEST_CANCELLATION'] : [];
  if (actor.role !== 'MERCHANT') return [];
  if (open.includes(ticket.status)) return ['AGREE', 'FULFILL', 'CANCEL'];
  return ticket.status === 'CANCELLATION_REQUESTED' ? ['REJECT_CANCELLATION', 'CANCEL'] : [];
}

export function ticketChanged(): never {
  throw new AppError('ticket_changed', 409, 'Este ticket mudou. Confira o estado atual antes de confirmar.');
}

export async function pendingRequest(scope: StoreScope, ticket: Redemption) {
  if (ticket.status !== 'CANCELLATION_REQUESTED') return null;
  const request = await scope.tx.redemptionEvent.findFirst({ where: { storeId: scope.store.id,
    redemptionId: ticket.id, kind: 'REQUEST_CANCELLATION' }, orderBy: { version: 'desc' } });
  if (!request || !request.fromStatus || !open.includes(request.fromStatus)) unavailable();
  return request;
}

export function resultingStatus(action: TicketAction, ticket: Redemption): TicketStatus {
  switch (action) {
    case 'AGREE': return 'AGREED';
    case 'FULFILL': return 'FULFILLED';
    case 'REQUEST_CANCELLATION': return 'CANCELLATION_REQUESTED';
    case 'REJECT_CANCELLATION':
      if (!ticket.cancellationFromStatus || !open.includes(ticket.cancellationFromStatus)) return ticketChanged();
      return ticket.cancellationFromStatus;
    case 'CANCEL': return 'CANCELLED';
  }
}

export async function cancellationImpact(scope: StoreScope, ticket: Redemption): Promise<TicketCancellationImpact> {
  const reward = await scope.tx.reward.findFirst({ where: { id: ticket.rewardId, storeId: scope.store.id } });
  if (!reward) unavailable();
  const available = await availablePoints(scope, ticket.participantMembershipId);
  const reason = ticket.stockBefore === null ? 'ISSUED_UNLIMITED' : reward.stock === null ? 'CATALOG_UNLIMITED' :
    reward.stock >= 1_000_000 ? 'STOCK_FULL' : reward.stockRevision >= 2_147_483_647 ? 'STOCK_REVISION_EXHAUSTED' : 'AVAILABLE';
  return { balanceBefore: available.toString(), balanceAfter: (available + BigInt(ticket.rewardCost)).toString(),
    refund: ticket.rewardCost.toString(), restock: { eligible: reason === 'AVAILABLE', reason,
      stock: reward.stock, stockRevision: reward.stockRevision } };
}
