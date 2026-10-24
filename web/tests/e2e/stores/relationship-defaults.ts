import type { Route } from '@playwright/test';
import type { StoreView } from '../../../src/contracts/stores';
import type { PointsBalance } from '../../../src/contracts/activities';

/** Somente os cenários controlados antigos podem reaproveitar seu handler GET. */
export function legacyStoreSearch(route: Route, original: URL) {
  if (original.pathname !== '/api/lojas/buscar' || route.request().method() !== 'POST') return null;
  const input = route.request().postDataJSON() as Record<string, unknown>;
  const url = new URL('/api/lojas', original);
  for (const key of ['q', 'role', 'state', 'page', 'pageSize']) {
    if (input[key] !== undefined) url.searchParams.set(key, String(input[key]));
  }
  const request = new Proxy(route.request(), {
    get(target, property) {
      if (property === 'method') return () => 'GET';
      if (property === 'url') return () => url.href;
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  const adapted = new Proxy(route, {
    get(target, property) {
      if (property === 'request') return () => request;
      if (property === 'fulfill') return async (options: Parameters<Route['fulfill']>[0] = {}) => {
        if (typeof options.body === 'string') {
          const value: unknown = JSON.parse(options.body);
          if (value && typeof value === 'object' && 'items' in value) {
            return target.fulfill({ ...options, body: JSON.stringify({ stores: value, invitation: null }) });
          }
        }
        return target.fulfill(options);
      };
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  return { route: adapted, url };
}

export function emptyPoints(store: StoreView): PointsBalance {
  return { storeId: store.id, participantMembershipId: store.membershipId, available: '0', pending: '0',
    today: { localDate: '2026-10-22', timezone: store.timezone, submitted: 0, approved: 0, credited: '0', adjusted: '0' } };
}

/** Compatibilidade dos cenários anteriores com as consultas auxiliares T12. */
export async function mockRelationshipDefaults(route: Route, url: URL, stores: StoreView[], displayName: string) {
  if (route.request().method() !== 'GET') return false;
  const path = url.pathname;
  let value: unknown;
  if (path === '/api/notificacoes/grupos') value = { items: [], page: 1, pageSize: 20, total: 0, attentionUnreadCount: 0 };
  else {
    const store = stores.find(item => path.startsWith(`/api/lojas/${item.id}/`));
    if (!store) return false;
    if (path.endsWith('/bilhete')) value = { current: null, writable: store.role === 'MERCHANT', ...(store.role === 'PARTICIPANT' ? { unread: false } : {}) };
    else if (path.endsWith('/reacao')) value = { conversationId: path.split('/')[5], version: 0, mine: null, writable: true, reactions: [] };
    else if (path.endsWith('/preferencias/notificacoes')) value = { storeId: store.id, version: 0, socialMuted: false, automaticApprovalNotices: true };
    else if (path.endsWith('/lojinha')) value = { store, person: { displayName }, merchant: { displayName: 'Rafa' }, points: emptyPoints(store),
      activities: [], rewards: [], categories: [], note: { current: null, writable: false, unread: false }, tickets: { total: 0, outstanding: 0 } };
    else if (path === `/api/lojas/${store.id}/resumo`) value = { store, counts: { pendingSubmissions: 0, outstandingTickets: 0, activeParticipants: 0 },
      checklist: [], pending: [], tickets: [], recent: [] };
    else return false;
  }
  await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Cache-Control': 'no-store' }, body: JSON.stringify(value) });
  return true;
}
