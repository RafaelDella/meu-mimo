import type { Page, Route } from '@playwright/test';
import type { RewardFields, RewardView } from '../../../src/contracts/rewards';
import type { RedemptionBody, TicketView } from '../../../src/contracts/redemptions';
import { ids, json, mockApi, store } from '../stores/helpers';

export { test, noOverflow, actionsFit } from '../stores/helpers';
export const rewardId = 'd1111111-1111-4111-8111-111111111111';
export const ticketId = 'e1111111-1111-4111-8111-111111111111';
export const conversationId = 'f1111111-1111-4111-8111-111111111111';
export const catalogPath = `/lojas/${ids.first}/mimos`;
export const detailPath = `${catalogPath}/${rewardId}`;
export const ticketsPath = `/lojas/${ids.first}/tickets`;
export const now = '2026-10-22T15:00:00.000Z';
export function reward(overrides: Partial<RewardView> = {}): RewardView {
  return { id: rewardId, storeId: ids.first, version: 1, stockRevision: 0, name: 'Café da ocasião', description: 'Um café preparado com carinho.',
    category: 'A dois', sticker: 'coffee', cost: 10, note: 'Um recadinho só nosso.', instructions: 'Converse para combinar o dia.', available: true,
    stock: null, createdAt: now, archivedAt: null, availability: null, ...overrides };
}
export function ticket(overrides: Partial<TicketView> = {}): TicketView {
  return { id: ticketId, code: 'MIMO-1234', storeId: ids.first, rewardId, participantMembershipId: store().membershipId,
    participant: { displayName: 'Ana participante' }, status: 'WAITING_AGREEMENT', createdAt: now, localDate: '2026-10-22', timezone: 'America/Sao_Paulo',
    snapshot: { name: 'Café da ocasião', description: 'Um café preparado com carinho.', category: 'A dois', sticker: 'coffee', cost: 10,
      note: 'Um recadinho só nosso.', instructions: 'Converse para combinar o dia.', rewardVersion: 1 }, balanceBefore: '15', balanceAfter: '5',
    conversation: { id: conversationId, storeId: ids.first, participantMembershipId: store().membershipId, subjectType: 'TICKET', subjectId: ticketId, writable: true },
    version: 1, agreementText: '', agreementDate: null, fulfilledAt: null, cancelledAt: null, eventsTotal: 1,
    pendingCancellation: null, actions: [], cancellationImpact: null,
    events: [{ id: ticketId, kind: 'ISSUED', version: 1, fromStatus: null, toStatus: 'WAITING_AGREEMENT', text: '', agreementDate: null,
      requestId: null, delta: '0', restocked: false, stockBefore: null, stockAfter: null, stockRevision: null, balanceBefore: null, balanceAfter: null,
      createdAt: now, author: { displayName: 'Ana participante' } }], ...overrides };
}
export type RewardState = {
  merchant: boolean; balance: string; pending: string; current: RewardView; rewards: RewardView[]; tickets: TicketView[];
  operations: Map<string, TicketView>; bodies: Record<string, unknown>[]; calls: string[]; queries: URLSearchParams[];
};
type Handler = (route: Route, url: URL, state: RewardState) => Promise<boolean>;
export function issue(state: RewardState, body: RedemptionBody) {
  const existing = state.operations.get(body.operationId); if (existing) return existing;
  const before = state.balance; state.balance = String(BigInt(before) - BigInt(state.current.cost));
  const current = state.current;
  const value = ticket({ id: body.operationId, balanceBefore: before, balanceAfter: state.balance,
    snapshot: { name: current.name, description: current.description, category: current.category, sticker: current.sticker, cost: current.cost,
      note: current.note, instructions: current.instructions, rewardVersion: current.version } });
  if (current.stock !== null) { current.stock -= 1; current.stockRevision += 1; }
  state.operations.set(body.operationId, value); state.tickets.unshift(value); return value;
}
function withAvailability(state: RewardState, value: RewardView): RewardView {
  if (state.merchant) return { ...value, availability: null };
  const shortfall = BigInt(value.cost) - BigInt(state.balance);
  const reason = value.archivedAt ? 'ARCHIVED' : !value.available ? 'UNAVAILABLE' : value.stock === 0 ? 'SOLD_OUT' : shortfall > 0n ? 'INSUFFICIENT_POINTS' : 'AVAILABLE';
  return { ...value, availability: { eligible: reason === 'AVAILABLE', reason, available: state.balance, pending: state.pending,
    resulting: String(BigInt(state.balance) - BigInt(value.cost)), shortfall: String(shortfall > 0n ? shortfall : 0n) } };
}
// Respostas controladas verificam a interface; não comprovam banco ou transações.
export async function mockRewards(page: Page, options: { merchant?: boolean; balance?: string; handler?: Handler } = {}) {
  const current = reward();
  const state: RewardState = { merchant: options.merchant ?? false, balance: options.balance ?? '15', pending: '3', current,
    rewards: [current], tickets: [], operations: new Map(), bodies: [], calls: [], queries: [] };
  const auth = await mockApi(page, async (route, url) => {
    state.calls.push(`${route.request().method()} ${url.pathname}${url.search}`);
    if (options.handler && await options.handler(route, url, state)) return true;
    const path = url.pathname; const method = route.request().method();
    if (!path.startsWith('/api/lojas/')) return false;
    if (path.endsWith('/pontos')) {
      await json(route, { storeId: ids.first, participantMembershipId: store().membershipId, available: state.balance, pending: state.pending,
        today: { localDate: '2026-10-22', timezone: 'America/Sao_Paulo', submitted: 1, approved: 1, credited: '15', adjusted: '0' } }); return true;
    }
    if (path.endsWith('/pontos/movimentos')) {
      const items = state.tickets.map(value => ({ id: value.id, storeId: ids.first, participantMembershipId: store().membershipId, submissionId: null,
        redemptionId: value.id, activityName: null, rewardName: value.snapshot.name, origin: { type: 'REDEMPTION', id: value.id, name: value.snapshot.name },
        amount: String(-value.snapshot.cost), kind: 'REDEMPTION_DEBIT', createdAt: now, participant: value.participant, actor: value.participant,
        path: `${ticketsPath}/${value.id}`, reviewEventId: null, compensatesEntryId: null }));
      await json(route, { items, page: 1, pageSize: 20, total: items.length }); return true;
    }
    if (path.endsWith('/tickets/resumo')) { await json(route, { total: state.tickets.length, outstanding: state.tickets.filter(value => ['WAITING_AGREEMENT', 'AGREED', 'CANCELLATION_REQUESTED'].includes(value.status)).length }); return true; }
    if (/\/operacoes\/[^/]+$/.test(path)) { await json(route, { ticket: state.operations.get(path.split('/').pop()!) ?? null }); return true; }
    if (path.endsWith('/resgatar')) {
      const body = route.request().postDataJSON() as RedemptionBody; state.bodies.push(body); await json(route, { ticket: issue(state, body) }); return true;
    }
    if (path.endsWith('/arquivar')) {
      state.bodies.push(route.request().postDataJSON()); state.current.archivedAt = now; state.current.version += 1;
      await json(route, { reward: withAvailability(state, state.current), appliedVersion: state.current.version }); return true;
    }
    if (/\/mimos\/[^/]+$/.test(path)) {
      if (method === 'PATCH') { const body = route.request().postDataJSON(); state.bodies.push(body); Object.assign(state.current, body, { version: state.current.version + 1 }); }
      await json(route, method === 'PATCH' ? { reward: withAvailability(state, state.current), appliedVersion: state.current.version } : withAvailability(state, state.current)); return true;
    }
    if (path.endsWith('/mimos')) {
      if (method === 'POST') { const body = route.request().postDataJSON() as RewardFields; state.bodies.push(body as unknown as Record<string, unknown>); Object.assign(state.current, body);
        await json(route, { reward: withAvailability(state, state.current), appliedVersion: 1 }); return true; }
      state.queries.push(url.searchParams); const pageNumber = Number(url.searchParams.get('page') ?? 1); const pageSize = Number(url.searchParams.get('pageSize') ?? 20);
      const items = state.rewards.filter(value => (!url.searchParams.get('q') || value.name.includes(url.searchParams.get('q')!)) &&
        (!url.searchParams.get('category') || value.category === url.searchParams.get('category')) && (url.searchParams.get('state') !== 'ARCHIVED' || value.archivedAt));
      await json(route, { items: items.slice((pageNumber - 1) * pageSize, pageNumber * pageSize).map(value => withAvailability(state, value)), page: pageNumber, pageSize, total: items.length, categories: ['A dois', 'Surpresas'] }); return true;
    }
    if (/\/tickets\/[^/]+$/.test(path)) { const value = state.tickets.find(item => item.id === path.split('/').pop()); await json(route, value ?? { code: 'resource_not_found', message: 'Ticket indisponível.' }, value ? 200 : 404); return true; }
    if (path.endsWith('/tickets')) {
      state.queries.push(url.searchParams); const pageNumber = Number(url.searchParams.get('page') ?? 1); const pageSize = Number(url.searchParams.get('pageSize') ?? 20);
      const items = state.tickets.filter(value => (!url.searchParams.get('status') || value.status === url.searchParams.get('status')) &&
        (!url.searchParams.get('membershipId') || value.participantMembershipId === url.searchParams.get('membershipId')));
      await json(route, { items: items.slice((pageNumber - 1) * pageSize, pageNumber * pageSize), page: pageNumber, pageSize, total: items.length }); return true;
    }
    if (path.endsWith('/comentarios')) { const conversation = ticket().conversation; await json(route, { conversation, items: [], page: 1, pageSize: 20, total: 0 }); return true; }
    return false;
  });
  auth.stores[0].role = state.merchant ? 'MERCHANT' : 'PARTICIPANT';
  auth.people = [{ id: store().membershipId, storeId: ids.first, profileId: ids.ana, role: 'PARTICIPANT', closedAt: null, profile: { displayName: 'Ana participante' } }];
  return { state, auth };
}
