import type { Route } from '@playwright/test';
import type { StoreView } from '../../../src/contracts/stores';
import type { PointsBalance } from '../../../src/contracts/activities';

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
