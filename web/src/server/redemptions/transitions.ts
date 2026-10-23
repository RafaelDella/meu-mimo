import '../only.ts';
import type { Redemption, RedemptionEvent } from '../../generated/prisma/client.ts';
import type { TicketEventPage, TicketTransitionBody, TicketTransitionLookup, TicketTransitionMutation } from '../../contracts/redemptions.ts';
import type { Identity } from '../auth/types.ts';
import { AppError } from '../errors.ts';
import { suppressionFor } from '../privacy/suppression.ts';
import { syncAlbumRetention } from '../albums/retention.ts';
import { enqueueRedemptionUpdated } from '../outbox/events.ts';
import { refundRedemption } from '../points/ledger.ts';
import { consumeStoreLimit } from '../stores/limits.ts';
import type { StoreScope } from '../stores/transaction.ts';
import { databaseNow, requireMembership, withStoreTransaction } from '../stores/transaction.ts';
import { operationConflict, pagination, resourceId, unavailable } from '../stores/validation.ts';
import { requireTicket } from './access.ts';
import { cancellationImpact, pendingRequest, resultingStatus, ticketActions, ticketChanged } from './state.ts';
import { transitionInput } from './transition-validation.ts';
import { ticketEventInclude, ticketEventView, ticketView } from './views.ts';

async function transitionResult(scope: StoreScope, ticket: Redemption, event: RedemptionEvent): Promise<TicketTransitionMutation> {
  const recorded = await scope.tx.redemptionEvent.findUnique({ where: { id: event.id }, include: ticketEventInclude });
  if (!recorded) unavailable();
  return { ticket: await ticketView(scope, ticket), event: ticketEventView(recorded, await suppressionFor(scope.tx, [recorded.actorProfileId])), appliedVersion: event.version };
}

function requireActionActor(scope: StoreScope, input: TicketTransitionBody) {
  const actor = requireMembership(scope);
  const role = input.action === 'REQUEST_CANCELLATION' ? 'PARTICIPANT' : 'MERCHANT';
  if (actor.role !== role) unavailable();
}

export async function transitionTicket(identity: Identity, storeId: string, ticketId: string,
  body: Record<string, unknown>): Promise<TicketTransitionMutation> {
  const { input, id, requestDigest } = transitionInput(body);
  await consumeStoreLimit(identity, 'write');
  return withStoreTransaction(identity, storeId, async scope => {
    const ticket = await requireTicket(scope, ticketId);
    requireActionActor(scope, input);
    const key = `meumimo:t10:ticket-operation:${id}`;
    await scope.tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
    const existing = await scope.tx.redemptionEvent.findUnique({ where: { id } });
    if (existing) {
      if (existing.storeId !== scope.store.id || existing.redemptionId !== ticket.id ||
          existing.actorProfileId !== identity.userId || existing.requestDigest !== requestDigest) operationConflict();
      return transitionResult(scope, ticket, existing);
    }
    if (ticket.version !== input.expectedVersion || !ticketActions(scope, ticket).includes(input.action)) ticketChanged();
    const request = await pendingRequest(scope, ticket);
    const impact = input.action === 'CANCEL' ? await cancellationImpact(scope, ticket) : null;
    if (input.action === 'CANCEL' && impact) {
      if (input.expectedBalance !== impact.balanceBefore) {
        throw new AppError('balance_changed', 409, 'O saldo mudou. Confira a devolução antes de confirmar o cancelamento.');
      }
      if (input.restock && (!impact.restock.eligible || input.expectedStockRevision !== impact.restock.stockRevision)) {
        throw new AppError('stock_changed', 409, 'O estoque mudou. Revise a escolha de reposição antes de cancelar.');
      }
    }
    const restocked = input.action === 'CANCEL' && input.restock;
    const stockBefore = restocked ? impact!.restock.stock! : null;
    const stockAfter = restocked ? stockBefore! + 1 : null;
    const stockRevision = restocked ? impact!.restock.stockRevision + 1 : null;
    const now = await databaseNow(scope.tx);
    const status = resultingStatus(input.action, ticket);
    const updated = await scope.tx.redemption.update({ where: { id: ticket.id }, data: {
      version: { increment: 1 }, status,
      ...(input.action === 'AGREE' ? { agreementText: input.text, agreementDate: input.agreementDate } : {}),
      ...(input.action === 'REQUEST_CANCELLATION' ? { cancellationFromStatus: ticket.status } : {}),
      ...(input.action === 'REJECT_CANCELLATION' || input.action === 'CANCEL' ? { cancellationFromStatus: null } : {}),
      ...(input.action === 'FULFILL' ? { fulfilledAt: now } : {}),
      ...(input.action === 'CANCEL' ? { cancelledAt: now } : {}),
    } });
    const event = await scope.tx.redemptionEvent.create({ data: {
      id, storeId: scope.store.id, redemptionId: ticket.id, actorProfileId: identity.userId,
      kind: input.action, version: updated.version, fromStatus: ticket.status, toStatus: status,
      text: 'text' in input ? input.text : '', agreementDate: input.action === 'AGREE' ? input.agreementDate : null,
      requestDigest, requestId: request?.id ?? null, delta: input.action === 'CANCEL' ? BigInt(ticket.rewardCost) : 0n,
      restocked, stockBefore, stockAfter, stockRevision,
      balanceBefore: impact ? BigInt(impact.balanceBefore) : null,
      balanceAfter: impact ? BigInt(impact.balanceAfter) : null, createdAt: now,
    } });
    if (input.action === 'CANCEL') await refundRedemption(scope, updated, event);
    if (restocked) await scope.tx.reward.update({ where: { id: ticket.rewardId }, data: {
      stock: stockAfter, stockRevision: { increment: 1 },
    } });
    if (input.action === 'FULFILL' || input.action === 'CANCEL') await syncAlbumRetention(scope, { ticketId: ticket.id });
    await enqueueRedemptionUpdated(scope.tx, event.id);
    return transitionResult(scope, updated, event);
  });
}

/** Consulta sem revelar uma operação de outro ator ou de outra relação. */
export async function lookupTicketTransition(identity: Identity, storeId: string, ticketId: string,
  operationId: string): Promise<TicketTransitionLookup> {
  const id = resourceId(operationId);
  await consumeStoreLimit(identity, 'read');
  return withStoreTransaction(identity, storeId, async scope => {
    const ticket = await requireTicket(scope, ticketId);
    const event = await scope.tx.redemptionEvent.findUnique({ where: { id } });
    if (!event) return { operation: null };
    if (event.storeId !== scope.store.id || event.redemptionId !== ticket.id ||
        event.actorProfileId !== identity.userId || event.kind === 'ISSUED') unavailable();
    return { operation: await transitionResult(scope, ticket, event) };
  });
}

export async function listTicketEvents(identity: Identity, storeId: string, ticketId: string,
  query = new URLSearchParams()): Promise<TicketEventPage> {
  const page = pagination(query);
  await consumeStoreLimit(identity, 'read');
  return withStoreTransaction(identity, storeId, async scope => {
    const ticket = await requireTicket(scope, ticketId);
    const where = { storeId: scope.store.id, redemptionId: ticket.id };
    const total = await scope.tx.redemptionEvent.count({ where });
    const events = await scope.tx.redemptionEvent.findMany({ where, include: ticketEventInclude,
      orderBy: [{ version: 'asc' }, { id: 'asc' }], skip: page.skip, take: page.pageSize });
    const suppressions = await suppressionFor(scope.tx, events.map(row => row.actorProfileId));
    return { items: events.map(row => ticketEventView(row, suppressions)), total, page: page.page, pageSize: page.pageSize };
  });
}
