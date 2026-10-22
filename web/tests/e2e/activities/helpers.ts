import type { Page, Route } from '@playwright/test';
import type { ActivityView, SubmissionView } from '../../../src/contracts/activities';
import type { MediaAssetView } from '../../../src/contracts/media';
import { ids, json, mockApi, store } from '../stores/helpers';

export { test, actionsFit, noOverflow, flushView } from '../stores/helpers';
export const activityId = '66666666-6666-4666-8666-666666666666';
export const collectionId = '77777777-7777-4777-8777-777777777777';
export const conversationId = '88888888-8888-4888-8888-888888888888';
export const now = '2026-10-22T15:00:00.000Z';
export const rootPath = `/lojas/${ids.first}/atividades`;
export const registerPath = `${rootPath}/${activityId}/registrar`;
export function activity(overrides: Partial<ActivityView> = {}): ActivityView {
  return { id: activityId, storeId: ids.first, name: 'Ler algumas páginas', description: 'Um tempinho para uma boa história.', category: 'Pra você', sticker: 'coffee',
    points: 15, frequency: 'DAILY', weeklyLimit: 1, approvalMode: 'MANUAL', version: 1, archivedAt: null, createdAt: now,
    availability: { eligible: true, used: 0, limit: 1, remaining: 1, localDate: '2026-10-22', timezone: 'America/Sao_Paulo',
      startsAt: '2026-10-22T03:00:00.000Z', endsAt: '2026-10-23T03:00:00.000Z', now, reason: 'AVAILABLE' }, ...overrides };
}
export function submission(current: ActivityView, id: string): SubmissionView {
  return { id, storeId: ids.first, activityId, participantMembershipId: store().membershipId, participant: { displayName: 'Ana' }, status: 'DRAFT', pointsState: 'NONE', caption: '',
    createdAt: now, receivedAt: null, approvedAt: null, localDate: null, timezone: null, periodKey: null, periodStart: null, periodEnd: null, occurrenceNumber: null,
    activity: structuredClone(current), snapshot: null, collectionId, evidenceAssetId: null, conversation: null,
    review: { expectedVersion: current.version, localDate: current.availability?.localDate ?? '2026-10-22', timezone: 'America/Sao_Paulo', now } };
}
export type State = {
  activity: ActivityView; drafts: Map<string, SubmissionView>; assets: Map<string, MediaAssetView>; mediaReady: boolean;
  finalBodies: Record<string, unknown>[]; finalCalls: string[]; prepares: string[]; activityBodies: Record<string, unknown>[];
  listQueries: URLSearchParams[]; recordQueries: URLSearchParams[]; denied: boolean;
};
type Handler = (route: Route, url: URL, state: State) => Promise<boolean>;
export async function mockActivities(page: Page, options: { merchant?: boolean; automatic?: boolean; handler?: Handler } = {}) {
  const state: State = { activity: activity({ approvalMode: options.automatic ? 'AUTOMATIC' : 'MANUAL' }), drafts: new Map(), assets: new Map(), mediaReady: false,
    finalBodies: [], finalCalls: [], prepares: [], activityBodies: [], listQueries: [], recordQueries: [], denied: false };
  const auth = await mockApi(page, async (route, url) => {
    if (options.handler && await options.handler(route, url, state)) return true;
    const method = route.request().method();
    const path = url.pathname;
    const api = `/api/lojas/${ids.first}`;
    if (!path.startsWith(`${api}/`) || ['/participacoes', '/convites'].some(ending => path.endsWith(ending))) return false;
    if (state.denied) { await json(route, { code: 'resource_not_found', message: 'Conteúdo indisponível.' }, 404); return true; }
    if (path === `${api}/atividades`) {
      if (method === 'GET') {
        state.listQueries.push(url.searchParams);
        const q = url.searchParams.get('q')?.toLowerCase() || '';
        const items = !q || state.activity.name.toLowerCase().includes(q) ? [state.activity] : [];
        await json(route, { items, page: 1, pageSize: 20, total: items.length });
      } else {
        const body = route.request().postDataJSON(); state.activityBodies.push(body);
        state.activity = { ...state.activity, ...body }; await json(route, { activity: state.activity, appliedVersion: 1 }, 201);
      }
    } else if (path === `${api}/atividades/${activityId}`) {
      if (method === 'PATCH') {
        const body = route.request().postDataJSON(); state.activityBodies.push(body);
        state.activity = { ...state.activity, ...body, version: state.activity.version + 1 };
        await json(route, { activity: state.activity, appliedVersion: state.activity.version });
      } else await json(route, state.activity);
    } else if (path.endsWith('/arquivar')) {
      state.activity = { ...state.activity, archivedAt: now, version: state.activity.version + 1 };
      await json(route, { activity: state.activity, appliedVersion: state.activity.version });
    } else if (path.endsWith('/preparar')) {
      const id = route.request().postDataJSON().operationId;
      state.prepares.push(id);
      if (!state.drafts.has(id)) state.drafts.set(id, submission(state.activity, id));
      await json(route, state.drafts.get(id), 201);
    } else if (path === `${api}/registros`) {
      state.recordQueries.push(url.searchParams);
      const items = [...state.drafts.values()].filter(value => value.status !== 'DRAFT');
      await json(route, { items, page: 1, pageSize: 20, total: items.length });
    } else if (path.endsWith('/enviar')) {
      const parts = path.split('/'); const id = parts[parts.length - 2];
      state.finalCalls.push(`POST:${id}`); const body = route.request().postDataJSON(); state.finalBodies.push(body);
      const value = confirm(state, id, body); await json(route, value);
    } else if (new RegExp(`^${api}/registros/[^/]+$`).test(path)) {
      const parts = path.split('/'); const id = parts[parts.length - 1]; state.finalCalls.push(`GET:${id}`);
      const found = state.drafts.get(id);
      if (found?.status === 'DRAFT') { found.activity = structuredClone(state.activity); found.review = { expectedVersion: state.activity.version, localDate: state.activity.availability!.localDate, timezone: 'America/Sao_Paulo', now }; }
      await json(route, found ?? { code: 'resource_not_found', message: 'Conteúdo indisponível.' }, found ? 200 : 404);
    } else if (path === `${api}/pontos`) {
      const values = [...state.drafts.values()];
      await json(route, { storeId: ids.first, participantMembershipId: store().membershipId, available: '9007199254740993',
        pending: String(values.filter(value => value.status === 'PENDING').reduce((total, value) => total + value.snapshot!.points, 0)),
        today: { localDate: '2026-10-22', timezone: 'America/Sao_Paulo', submitted: values.filter(value => value.status !== 'DRAFT').length,
          approved: values.filter(value => value.status === 'APPROVED').length, credited: '0' } });
    } else if (path === `${api}/pontos/movimentos`) await json(route, { items: [], page: 1, pageSize: 20, total: 0 });
    else if (path.includes('/midia/')) await media(route, url, state);
    else if (path.endsWith('/comentarios')) await json(route, { conversation: [...state.drafts.values()].find(value => value.conversation)?.conversation,
      items: [], page: 1, pageSize: 20, total: 0 });
    else return false;
    return true;
  });
  auth.stores = [store({ role: options.merchant ? 'MERCHANT' : 'PARTICIPANT' })];
  return { state, auth };
}
export function confirm(state: State, id: string, body: Record<string, unknown>) {
  const value = state.drafts.get(id)!;
  const { name, description, category, sticker, points, frequency, weeklyLimit, approvalMode, version } = state.activity;
  Object.assign(value, { status: approvalMode === 'MANUAL' ? 'PENDING' : 'APPROVED', pointsState: approvalMode === 'MANUAL' ? 'PENDING' : 'CREDITED',
    caption: body.caption, receivedAt: now, approvedAt: approvalMode === 'AUTOMATIC' ? now : null, evidenceAssetId: body.evidenceAssetId,
    localDate: body.expectedLocalDate, timezone: body.expectedTimezone, review: null,
    snapshot: { name, description, category, sticker, points, frequency, weeklyLimit, approvalMode, activityVersion: version },
    conversation: { id: conversationId, storeId: ids.first, participantMembershipId: value.participantMembershipId, subjectType: 'SUBMISSION', subjectId: id, writable: true } });
  return value;
}
async function media(route: Route, url: URL, state: State) {
  const path = url.pathname; const method = route.request().method();
  if (path.endsWith(`/midia/${collectionId}`)) {
    if (method === 'POST') {
      const file = route.request().postDataJSON().files[0];
      state.assets.set(file.operationId, { id: file.operationId, collectionId, revision: 1, mediaType: 'PHOTO', mimeType: file.mimeType, byteLength: file.byteLength,
        uploadedBytes: 0, state: 'UPLOADING', createdAt: now, publishedAt: null, width: null, height: null, durationMs: null, failureCode: null });
      await json(route, { items: [state.assets.get(file.operationId)] });
    } else {
      const items = [...state.assets.values()].filter(value => value.state !== 'REMOVED').map(value => state.mediaReady ? { ...value, state: 'READY', width: 1, height: 1 } : value);
      const closed = [...state.drafts.values()].some(value => value.status !== 'DRAFT');
      await json(route, { collection: { id: collectionId, storeId: ids.first, purpose: 'EVIDENCE', revision: 1, writable: !closed }, items, page: 1, pageSize: 50, total: items.length });
    }
  } else {
    const id = path.split('/arquivos/')[1]?.split('/')[0]; const asset = state.assets.get(id);
    if (!asset) { await json(route, { code: 'resource_not_found', message: 'Arquivo indisponível.' }, 404); return; }
    if (path.endsWith('/partes')) asset.uploadedBytes = asset.byteLength;
    if (path.endsWith('/concluir')) asset.state = 'QUEUED';
    if (path.endsWith('/remover')) asset.state = 'REMOVED';
    await json(route, asset);
  }
}
