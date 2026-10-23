import type { Page, Route } from '@playwright/test';
import type { TicketAction, TicketEventView, TicketStatus, TicketTransitionBody, TicketTransitionMutation, TicketView } from '../../../src/contracts/redemptions';
import { mockRewards, now, ticket, ticketId, ticketsPath } from '../redemptions/helpers';
import type { RewardState } from '../redemptions/helpers';
import { json } from '../stores/helpers';

export { test, noOverflow, actionsFit } from '../stores/helpers';
export { now, ticketId, ticketsPath } from '../redemptions/helpers';
export const ticketPath = `${ticketsPath}/${ticketId}`;
export type TicketMock = {
  current: TicketView; history: TicketEventView[]; operations: Map<string, TicketTransitionMutation>;
  bodies: TicketTransitionBody[]; reward: RewardState | null; merchant: boolean;
};
type Handler = (route: Route, url: URL, state: TicketMock) => Promise<boolean>;
function allowed(status: TicketStatus, merchant: boolean): TicketAction[] {
  if (status === 'FULFILLED' || status === 'CANCELLED') return [];
  if (status === 'CANCELLATION_REQUESTED') return merchant ? ['REJECT_CANCELLATION', 'CANCEL'] : [];
  return merchant ? ['AGREE', 'FULFILL', 'CANCEL'] : ['REQUEST_CANCELLATION'];
}
export function ticketView(state: TicketMock) {
  const current = state.current;
  current.actions = allowed(current.status, state.merchant);
  current.events = state.history.slice(0, 20); current.eventsTotal = state.history.length;
  current.cancellationImpact = current.actions.includes('CANCEL') ? {
    balanceBefore: state.reward?.balance ?? '5', balanceAfter: String(BigInt(state.reward?.balance ?? '5') + 10n), refund: '10',
    restock: { eligible: state.reward?.current.stock !== null && (state.reward?.current.stock ?? 0) < 1_000_000, reason: 'AVAILABLE', stock: state.reward?.current.stock ?? null, stockRevision: state.reward?.current.stockRevision ?? 1 },
  } : null;
  return current;
}
export function applyTransition(state: TicketMock, body: TicketTransitionBody): TicketTransitionMutation {
  const existing = state.operations.get(body.operationId); if (existing) return { ...existing, ticket: ticketView(state) };
  const current = state.current; const previous = current.status; const request = current.pendingCancellation;
  const next: TicketStatus = body.action === 'AGREE' ? 'AGREED' : body.action === 'FULFILL' ? 'FULFILLED' :
    body.action === 'REQUEST_CANCELLATION' ? 'CANCELLATION_REQUESTED' : body.action === 'REJECT_CANCELLATION' ? request!.fromStatus : 'CANCELLED';
  const event: TicketEventView = { id: body.operationId, kind: body.action, version: current.version + 1, fromStatus: previous, toStatus: next,
    text: 'text' in body ? body.text : '', agreementDate: body.action === 'AGREE' ? body.agreementDate : null, requestId: request?.id ?? null,
    delta: body.action === 'CANCEL' ? '10' : '0', restocked: body.action === 'CANCEL' && body.restock,
    stockBefore: null, stockAfter: null, stockRevision: null, balanceBefore: null, balanceAfter: null,
    createdAt: now, author: { displayName: state.merchant ? 'Rafa lojista' : 'Ana participante' } };
  if (body.action === 'AGREE') { current.agreementText = body.text; current.agreementDate = body.agreementDate; }
  if (body.action === 'FULFILL') current.fulfilledAt = now;
  if (body.action === 'REQUEST_CANCELLATION') current.pendingCancellation = { id: event.id, text: body.text, fromStatus: previous, createdAt: now };
  if (body.action === 'CANCEL' && state.reward) {
    current.cancelledAt = now; event.balanceBefore = state.reward.balance; state.reward.balance = String(BigInt(state.reward.balance) + 10n); event.balanceAfter = state.reward.balance;
    if (body.restock && state.reward.current.stock !== null) {
      event.stockBefore = state.reward.current.stock; state.reward.current.stock += 1; state.reward.current.stockRevision += 1;
      event.stockAfter = state.reward.current.stock; event.stockRevision = state.reward.current.stockRevision;
    }
  }
  if (['CANCEL', 'REJECT_CANCELLATION'].includes(body.action)) current.pendingCancellation = null;
  current.status = next; current.version = event.version; state.history.push(event);
  const result = { ticket: ticketView(state), event, appliedVersion: event.version };
  state.operations.set(body.operationId, result); return result;
}
// Somente respostas controladas de UI; o domínio e o ledger são provados por HTTP real.
export async function mockTickets(page: Page, options: { merchant?: boolean; status?: TicketStatus; handler?: Handler } = {}) {
  const current = ticket({ status: options.status ?? 'WAITING_AGREEMENT' });
  if (current.status === 'AGREED') { current.agreementText = 'Nosso combinado anterior'; current.agreementDate = '2026-10-20'; }
  if (current.status === 'CANCELLATION_REQUESTED') current.pendingCancellation = { id: 'request-id', text: 'Pedido privado da Ana', fromStatus: 'WAITING_AGREEMENT', createdAt: now };
  if (current.status === 'FULFILLED') current.fulfilledAt = now;
  if (current.status === 'CANCELLED') current.cancelledAt = now;
  const state: TicketMock = { current, history: [...current.events], operations: new Map(), bodies: [], reward: null, merchant: options.merchant ?? false };
  const base = await mockRewards(page, { merchant: options.merchant, balance: '5', handler: async (route, url) => {
    if (options.handler && await options.handler(route, url, state)) return true;
    if (!url.pathname.includes(`/tickets/${ticketId}`)) return false;
    if (url.pathname.endsWith('/transicoes')) {
      const body = route.request().postDataJSON() as TicketTransitionBody; state.bodies.push(body);
      await json(route, applyTransition(state, body)); return true;
    }
    if (url.pathname.includes('/operacoes/')) {
      const operation = state.operations.get(url.pathname.split('/').pop()!);
      await json(route, { operation: operation ? { ...operation, ticket: ticketView(state) } : null }); return true;
    }
    if (url.pathname.endsWith('/eventos')) {
      const pageNumber = Number(url.searchParams.get('page') ?? 1); const pageSize = Number(url.searchParams.get('pageSize') ?? 20);
      await json(route, { items: state.history.slice((pageNumber - 1) * pageSize, pageNumber * pageSize), page: pageNumber, pageSize, total: state.history.length }); return true;
    }
    if (url.pathname.endsWith(`/tickets/${ticketId}`)) { await json(route, ticketView(state)); return true; }
    return false;
  } });
  state.reward = base.state; base.state.current.stock = 2; base.state.current.stockRevision = 1; base.state.tickets = [current];
  return { state, auth: base.auth };
}
