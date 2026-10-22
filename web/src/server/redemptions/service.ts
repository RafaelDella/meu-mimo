import '../only.ts';
import type { Prisma } from '../../generated/prisma/client.ts';
import type { RedemptionLookup, RedemptionMutation, TicketPage, TicketSummary, TicketView } from '../../contracts/redemptions.ts';
import type { Identity } from '../auth/types.ts';
import { periodAt } from '../activities/periods.ts';
import { digest, positiveInteger } from '../activities/validation.ts';
import { registerConversation } from '../conversations/service.ts';
import { AppError } from '../errors.ts';
import { enqueueRedemptionIssued } from '../outbox/events.ts';
import { availablePoints } from '../points/ledger.ts';
import { movementRange, targetParticipant } from '../points/queries.ts';
import { requireReward } from '../rewards/access.ts';
import { consumeStoreLimit } from '../stores/limits.ts';
import { assertStoreWritable, databaseNow, withStoreTransaction } from '../stores/transaction.ts';
import { allowedFields, choice, invalidField, operationConflict, operationId, pagination, resourceId, unavailable } from '../stores/validation.ts';
import { localDate } from '../submissions/validation.ts';
import { requireRedeemingParticipant, requireTicket } from './access.ts';
import { ticketView } from './views.ts';

function redemptionInput(body: Record<string, unknown>) {
  allowedFields(body, ['operationId', 'expectedVersion', 'expectedBalance']);
  const id = operationId(body);
  const expectedVersion = positiveInteger(body.expectedVersion);
  if (typeof body.expectedBalance !== 'string' || !/^(?:0|-?[1-9]\d{0,18})$/.test(body.expectedBalance)) invalidField();
  const expectedBalance = BigInt(body.expectedBalance);
  if (expectedBalance < -9_223_372_036_854_775_808n || expectedBalance > 9_223_372_036_854_775_807n) invalidField();
  return { id, expectedVersion, expectedBalance, requestDigest: digest({ expectedVersion, expectedBalance: expectedBalance.toString() }) };
}

export async function redeemReward(identity: Identity, storeId: string, rewardId: string,
  body: Record<string, unknown>): Promise<RedemptionMutation> {
  const input = redemptionInput(body);
  await consumeStoreLimit(identity, 'write');
  return withStoreTransaction(identity, storeId, async scope => {
    const participant = requireRedeemingParticipant(scope);
    const reward = await requireReward(scope, rewardId);
    const key = `meumimo:t09:redemption-operation:${input.id}`;
    await scope.tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
    const existing = await scope.tx.redemption.findUnique({ where: { id: input.id } });
    if (existing) {
      if (existing.storeId !== scope.store.id || existing.rewardId !== reward.id ||
          existing.authorProfileId !== identity.userId || existing.participantMembershipId !== participant.id ||
          existing.requestDigest !== input.requestDigest) operationConflict();
      return { ticket: await ticketView(scope, existing) };
    }
    assertStoreWritable(scope);
    if (reward.version !== input.expectedVersion) throw new AppError('reward_changed', 409, 'Este mimo mudou. Revise o custo e as instruções antes de resgatar.');
    if (reward.archivedAt || !reward.available || reward.stock === 0) {
      throw new AppError('reward_unavailable', 409, 'Este mimo não está disponível para novos resgates. Confira o catálogo.');
    }
    const balanceBefore = await availablePoints(scope, participant.id);
    if (balanceBefore !== input.expectedBalance) throw new AppError('balance_changed', 409, 'Seu saldo mudou. Revise o saldo restante antes de resgatar.');
    if (balanceBefore < BigInt(reward.cost)) throw new AppError('insufficient_points', 409, 'Você ainda não tem pontos suficientes para este mimo.');
    if (reward.stock !== null && reward.stockRevision >= 2_147_483_647) {
      throw new AppError('reward_unavailable', 409, 'Este mimo está disponível somente para consulta.');
    }
    const now = await databaseNow(scope.tx);
    const period = await periodAt(scope.tx, scope.store.timezone, 'DAILY', now);
    const stockBefore = reward.stock;
    const stockAfter = stockBefore === null ? null : stockBefore - 1;
    const stockRevision = stockBefore === null ? null : reward.stockRevision + 1;
    if (stockBefore !== null) await scope.tx.reward.update({ where: { id: reward.id },
      data: { stock: stockAfter, stockRevision: { increment: 1 } } });
    const ticket = await scope.tx.redemption.create({ data: { id: input.id, storeId: scope.store.id,
      rewardId: reward.id, participantMembershipId: participant.id, authorProfileId: identity.userId,
      code: `MIMO-${input.id.toUpperCase()}`, status: 'WAITING_AGREEMENT', requestDigest: input.requestDigest,
      expectedBalance: input.expectedBalance, rewardVersion: reward.version, rewardName: reward.name,
      rewardDescription: reward.description, rewardCategory: reward.category, rewardSticker: reward.sticker,
      rewardCost: reward.cost, rewardNote: reward.note, rewardInstructions: reward.instructions,
      balanceBefore, balanceAfter: balanceBefore - BigInt(reward.cost), stockBefore, stockAfter, stockRevision,
      timezone: scope.store.timezone, localDate: period.localDate, createdAt: now } });
    await scope.tx.redemptionEvent.create({ data: { storeId: scope.store.id, redemptionId: ticket.id,
      actorProfileId: identity.userId, kind: 'ISSUED', createdAt: now } });
    await scope.tx.pointsEntry.create({ data: { storeId: scope.store.id, participantMembershipId: participant.id,
      redemptionId: ticket.id, actorProfileId: identity.userId, kind: 'REDEMPTION_DEBIT', amount: -BigInt(reward.cost),
      sourceKey: `redemption.debit:${ticket.id}`, createdAt: now } });
    await registerConversation(scope, { subjectType: 'TICKET', subjectId: ticket.id, participantMembershipId: participant.id });
    await enqueueRedemptionIssued(scope.tx, ticket.id);
    if (!scope.store.domainStartedAt) await scope.tx.store.update({ where: { id: scope.store.id }, data: { domainStartedAt: now } });
    return { ticket: await ticketView(scope, ticket) };
  });
}

export async function readTicket(identity: Identity, storeId: string, ticketId: string): Promise<TicketView> {
  await consumeStoreLimit(identity, 'read');
  return withStoreTransaction(identity, storeId, async scope => ticketView(scope, await requireTicket(scope, ticketId)));
}

/** Ausência só é revelada depois de autorizar a origem desta intenção. */
export async function lookupRedemption(identity: Identity, storeId: string, rewardId: string, operation: string): Promise<RedemptionLookup> {
  const id = resourceId(operation);
  await consumeStoreLimit(identity, 'read');
  return withStoreTransaction(identity, storeId, async scope => {
    const participant = requireRedeemingParticipant(scope);
    const reward = await requireReward(scope, rewardId);
    const ticket = await scope.tx.redemption.findUnique({ where: { id } });
    if (!ticket) return { ticket: null };
    if (ticket.storeId !== scope.store.id || ticket.rewardId !== reward.id ||
        ticket.authorProfileId !== identity.userId || ticket.participantMembershipId !== participant.id) unavailable();
    return { ticket: await ticketView(scope, ticket) };
  });
}

export async function listTickets(identity: Identity, storeId: string, query = new URLSearchParams()): Promise<TicketPage> {
  const page = pagination(query);
  const status = choice(query, 'status', ['WAITING_AGREEMENT', 'AGREED', 'FULFILLED', 'CANCELLATION_REQUESTED', 'CANCELLED'] as const);
  const from = query.has('from') ? localDate(query.get('from')) : null;
  const to = query.has('to') ? localDate(query.get('to')) : null;
  if (from && to && from > to) invalidField();
  await consumeStoreLimit(identity, 'read');
  return withStoreTransaction(identity, storeId, async scope => {
    const membershipId = await targetParticipant(scope, query, true);
    const where: Prisma.RedemptionWhereInput = { storeId: scope.store.id,
      participant: { accessRevokedAt: null, role: 'PARTICIPANT' },
      ...(membershipId ? { participantMembershipId: membershipId } : {}), ...(status ? { status } : {}),
      ...(from || to ? { createdAt: await movementRange(scope, from, to) } : {}) };
    const total = await scope.tx.redemption.count({ where });
    const rows = await scope.tx.redemption.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: page.skip, take: page.pageSize });
    const items: TicketView[] = [];
    for (const row of rows) items.push(await ticketView(scope, row));
    return { items, total, page: page.page, pageSize: page.pageSize };
  });
}

export async function readTicketSummary(identity: Identity, storeId: string, query = new URLSearchParams()): Promise<TicketSummary> {
  await consumeStoreLimit(identity, 'read');
  return withStoreTransaction(identity, storeId, async scope => {
    const membershipId = await targetParticipant(scope, query, true);
    const where: Prisma.RedemptionWhereInput = { storeId: scope.store.id,
      participant: { accessRevokedAt: null, role: 'PARTICIPANT' }, ...(membershipId ? { participantMembershipId: membershipId } : {}) };
    const total = await scope.tx.redemption.count({ where });
    const outstanding = await scope.tx.redemption.count({ where: { ...where, status: { in: ['WAITING_AGREEMENT', 'AGREED', 'CANCELLATION_REQUESTED'] } } });
    return { total, outstanding };
  });
}
