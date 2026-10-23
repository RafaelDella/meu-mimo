import type { Page, Route } from '@playwright/test';
import type { NoteBody, NoteMutation, NoteVersion } from '../../../src/contracts/notes';
import type { ReactionBody, ReactionMutation, ReactionState } from '../../../src/contracts/reactions';
import type { FeedItem } from '../../../src/contracts/feed';
import type { NotificationGroupView, NotificationPreferences, PreferencesBody, PreferencesMutation } from '../../../src/contracts/notifications';
import type { StoreView } from '../../../src/contracts/stores';
import { ids, json, mockApi, store } from '../stores/helpers';

export { ids, json, test, noOverflow, actionsFit } from '../stores/helpers';
export const now = '2026-10-22T12:00:00.000Z';
export const membershipId = '55555555-5555-4555-8555-555555555555';
export const conversationId = '77777777-7777-4777-8777-777777777777';
export const noteId = '88888888-8888-4888-8888-888888888888';
export const groupId = '99999999-9999-4999-8999-999999999999';
export const base = `/api/lojas/${ids.first}`;
export const home = `/lojas/${ids.first}`;
export const personPath = `${home}/pessoas/${membershipId}`;
export const notePath = `${base}/participacoes/${membershipId}/bilhete`;
export const reactionPath = `${base}/conversas/${conversationId}/reacao`;
export function note(version = 1, text = `Carinho privado versão ${version}`): NoteVersion {
  return { id: version === 1 ? noteId : `88888888-8888-4888-8888-${String(version).padStart(12, '0')}`, storeId: ids.first, participantMembershipId: membershipId, version, text, createdAt: now, author: { displayName: 'Rafa' } };
}
export function group(): NotificationGroupView {
  return { id: groupId, version: 1, storeId: ids.first, storeName: 'Loja da Ana', category: 'SOCIAL', count: 1, unreadCount: 1, attentionActive: true,
    latest: { id: noteId, kind: 'REACTION_CHANGED', storeId: ids.first, storeName: 'Loja da Ana', createdAt: now, occurredAt: now, readAt: null, actor: { displayName: 'Rafa' } },
    firstOccurredAt: now, lastOccurredAt: now, lastDeliveredAt: now };
}
export type RelationshipMock = {
  store: StoreView; note: NoteVersion | null; read: Set<string>; versions: Map<string, NoteVersion>;
  noteBodies: NoteBody[]; noteOperations: Map<string, NoteMutation>; reaction: ReactionState;
  reactionBodies: ReactionBody[]; reactionOperations: Map<string, ReactionMutation>;
  preferences: NotificationPreferences; preferenceBodies: PreferencesBody[]; preferenceOperations: Map<string, PreferencesMutation>;
  groups: NotificationGroupView[]; readBodies: { throughVersion: number }[]; calls: string[]; balance: string;
};
type Handler = (route: Route, url: URL, state: RelationshipMock) => Promise<boolean>;
export function applyNote(state: RelationshipMock, body: NoteBody): NoteMutation {
  const old = state.noteOperations.get(body.operationId); if (old) return { ...old, current: state.note! };
  state.note = { ...note((state.note?.version ?? 0) + 1, body.text), id: body.operationId }; state.versions.set(state.note.id, state.note);
  const result = { applied: state.note, current: state.note, appliedVersion: state.note.version }; state.noteOperations.set(body.operationId, result); return result;
}
export function feedItem(state: RelationshipMock, index = 1): FeedItem {
  return { id: `feed-${index}`, subjectType: 'SUBMISSION', subjectId: noteId, storeId: state.store.id, participantMembershipId: membershipId,
    participant: { displayName: 'Ana participante' }, name: `Conquista privada ${index}`, status: 'APPROVED', occurredAt: now,
    path: `${home}/registros/${noteId}`, conversationId, summary: 'Pequeno gesto confirmado.', publishedMediaCount: 0, preview: null, reactions: state.reaction };
}
export async function mockRelationship(page: Page, options: { merchant?: boolean; empty?: boolean; handler?: Handler } = {}) {
  const state: RelationshipMock = {
    store: store({ role: options.merchant ? 'MERCHANT' : 'PARTICIPANT' }), note: options.empty ? null : note(), read: new Set(), versions: new Map([[noteId, note()]]),
    noteBodies: [], noteOperations: new Map(), reaction: { conversationId, version: 0, mine: null, writable: true, reactions: [] },
    reactionBodies: [], reactionOperations: new Map(), preferences: { storeId: ids.first, version: 0, socialMuted: false, automaticApprovalNotices: true },
    preferenceBodies: [], preferenceOperations: new Map(), groups: options.empty ? [] : [group()], readBodies: [], calls: [], balance: '15',
  };
  const auth = await mockApi(page, async (route, url, account) => {
    state.calls.push(`${route.request().method()} ${url.pathname}${url.search}`); account.stores = [state.store];
    if (options.handler && await options.handler(route, url, state)) return true;
    const path = url.pathname; const method = route.request().method();
    if (path === `${base}/bilhete`) { await json(route, { current: state.note, writable: true, unread: !!state.note && !state.read.has(state.note.id) }); return true; }
    if (path === notePath) {
      if (method === 'PATCH') { const body = route.request().postDataJSON() as NoteBody; state.noteBodies.push(body); await json(route, applyNote(state, body)); }
      else await json(route, { current: state.note, writable: true }); return true;
    }
    if (path.startsWith(`${notePath}/operacoes/`)) { const operation = state.noteOperations.get(path.split('/').pop()!); await json(route, { operation: operation ? { ...operation, current: state.note } : null }); return true; }
    if (path.startsWith(`${base}/bilhetes/versoes/`)) {
      const id = path.split('/')[6]; const value = state.versions.get(id);
      if (!value) { await json(route, { code: 'resource_not_found', message: 'Bilhete indisponível.' }, 404); return true; }
      if (path.endsWith('/lida')) { state.read.add(id); await json(route, { versionId: id, readAt: now }); }
      else await json(route, value); return true;
    }
    if (path === reactionPath) {
      if (method === 'PUT') {
        const body = route.request().postDataJSON() as ReactionBody; state.reactionBodies.push(body);
        let result = state.reactionOperations.get(body.operationId);
        if (!result) { const from = state.reaction.mine; state.reaction = { ...state.reaction, version: state.reaction.version + 1, mine: body.emoji,
          reactions: body.emoji ? [{ emoji: body.emoji, author: { id: ids.ana, displayName: 'Você' } }] : [] };
          result = { state: state.reaction, appliedVersion: state.reaction.version, event: { id: body.operationId, from, to: body.emoji, createdAt: now } }; state.reactionOperations.set(body.operationId, result); }
        await json(route, { ...result, state: state.reaction });
      } else await json(route, state.reaction); return true;
    }
    if (path.startsWith(`${reactionPath}/operacoes/`)) { const result = state.reactionOperations.get(path.split('/').pop()!); await json(route, { operation: result ? { ...result, state: state.reaction } : null }); return true; }
    if (path === '/api/notificacoes/grupos') {
      const items = state.groups.filter(item => (!url.searchParams.get('storeId') || item.storeId === url.searchParams.get('storeId')) && (!url.searchParams.get('category') || item.category === url.searchParams.get('category')));
      await json(route, { items, page: 1, pageSize: 20, total: items.length, attentionUnreadCount: state.groups.filter(item => item.unreadCount && item.attentionActive).length }); return true;
    }
    if (path.endsWith('/lida') && path.startsWith('/api/notificacoes/grupos/')) {
      const body = route.request().postDataJSON() as { throughVersion: number }; state.readBodies.push(body);
      const current = state.groups.find(item => item.id === path.split('/')[4])!; current.unreadCount = Math.max(0, current.version - body.throughVersion); await json(route, current); return true;
    }
    if (path.endsWith('/destino') && path.startsWith('/api/notificacoes/grupos/')) { await json(route, { type: 'note', storeId: ids.first, participantMembershipId: membershipId, subjectId: noteId, path: `${home}?bilhete=${noteId}` }); return true; }
    if (path === `${base}/preferencias/notificacoes`) {
      if (method === 'PATCH') { const body = route.request().postDataJSON() as PreferencesBody; state.preferenceBodies.push(body);
        state.preferences = { storeId: ids.first, version: state.preferences.version + 1, socialMuted: body.socialMuted, automaticApprovalNotices: body.automaticApprovalNotices };
        const result = { preferences: state.preferences, appliedVersion: state.preferences.version }; state.preferenceOperations.set(body.operationId, result);
        for (const item of state.groups) if (item.category === 'SOCIAL') item.attentionActive = !body.socialMuted; await json(route, result);
      } else await json(route, state.preferences); return true;
    }
    if (path.startsWith(`${base}/preferencias/notificacoes/operacoes/`)) { await json(route, { operation: state.preferenceOperations.get(path.split('/').pop()!) ?? null }); return true; }
    const points = { storeId: ids.first, participantMembershipId: membershipId, available: state.balance, pending: '7', today: { localDate: '2026-10-22', timezone: 'America/Sao_Paulo', submitted: 2, approved: 1, credited: '15', adjusted: '0' } };
    if (path === `${base}/lojinha`) { await json(route, { store: state.store, person: { displayName: 'Ana participante' }, merchant: { displayName: 'Rafa' }, points,
      activities: [], rewards: [], categories: [], note: { current: state.note, writable: true, unread: !!state.note && !state.read.has(state.note.id) }, tickets: { total: 3, outstanding: 2 } }); return true; }
    if (path === `${base}/resumo`) { await json(route, { store: state.store, counts: { pendingSubmissions: 2, outstandingTickets: 3, activeParticipants: 4 },
      checklist: [{ key: 'PRESENTATION', done: true, path: `${home}/configuracoes` }, { key: 'ACTIVITY', done: false, path: `${home}/atividades` }],
      pending: [], tickets: [], recent: [] }); return true; }
    if (path === `${base}/participacoes/${membershipId}/resumo`) { await json(route, { person: { id: membershipId, storeId: ids.first, profileId: ids.ana, role: 'PARTICIPANT', closedAt: null, profile: { displayName: 'Ana participante' } }, points,
      pendingSubmissions: 2, outstandingTickets: 3, recent: [], note: { current: state.note, writable: true } }); return true; }
    if (path === `${base}/resumo/acontecimentos`) { await json(route, { items: [], page: 1, pageSize: 20, total: 0 }); return true; }
    if (path === `${base}/mural`) { const items = options.empty ? [] : [feedItem(state)]; await json(route, { items, page: 1, pageSize: 20, total: items.length }); return true; }
    if (path.endsWith(`/conversas/${conversationId}/comentarios`)) { await json(route, { conversation: { id: conversationId, storeId: ids.first, subjectType: 'SUBMISSION', subjectId: noteId, writable: true }, items: [], page: 1, pageSize: 20, total: 0 }); return true; }
    return false;
  });
  return { state, auth };
}
export async function refresh(page: Page) { await page.evaluate(() => window.dispatchEvent(new Event('meumimo:relationship-changed'))); }
