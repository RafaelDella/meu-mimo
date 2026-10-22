import type { Page, Route } from '@playwright/test';
import type { PointsEntryView, ResponseBody, ReviewAction, ReviewBody, ReviewEventView, ReviewMutation, SubmissionView } from '../../../src/contracts/activities';
import type { MediaAssetView } from '../../../src/contracts/media';
import { activity, collectionId, conversationId, mockActivities, now, submission } from '../activities/helpers';
import { ids, json, store } from '../stores/helpers';

export { test, noOverflow, actionsFit } from '../stores/helpers';
export const submissionId = 'a1111111-1111-4111-8111-111111111111';
export const eventId = 'b1111111-1111-4111-8111-111111111111';
export const originPath = `/lojas/${ids.first}/registros/${submissionId}`;
export const statementPath = `/lojas/${ids.first}/extrato`;
const api = `/api/lojas/${ids.first}`;
export type ReviewState = {
  current: SubmissionView; balance: string; events: ReviewEventView[]; operations: Map<string, ReviewMutation>;
  bodies: Record<string, unknown>[]; calls: string[]; entries: PointsEntryView[]; queries: URLSearchParams[];
  assets: Map<string, MediaAssetView>; ready: boolean; merchant: boolean; responded: boolean; closed: boolean;
};
type Handler = (route: Route, url: URL, state: ReviewState) => Promise<boolean>;
export function photo(id: string, revision = 1): MediaAssetView {
  return { id, collectionId, revision, mediaType: 'PHOTO', mimeType: 'image/png', byteLength: 10, uploadedBytes: 10,
    state: 'READY', createdAt: now, publishedAt: revision === 1 ? now : null, width: 1, height: 1, durationMs: null, failureCode: null };
}
export function event(kind: ReviewEventView['kind'], overrides: Partial<ReviewEventView> = {}): ReviewEventView {
  return { id: eventId, submissionId, kind, version: 1, createdAt: now, author: { id: ids.ana, displayName: 'Rafa' },
    fromStatus: 'PENDING', toStatus: 'APPROVED', reason: '', text: '', evidenceAssetId: null, evidenceRevision: null,
    requestId: null, delta: '15', pointsEntryId: null, ...overrides };
}
export function analysis(state: ReviewState) {
  const value = state.current;
  const credited = value.pointsState === 'CREDITED';
  const actions: ReviewAction[] = state.closed || !state.merchant ? [] : value.status === 'PENDING' ? ['APPROVE', 'CONTEST', 'VOID'] :
    value.status === 'APPROVED' ? ['CONTEST', 'VOID'] : value.status === 'VOIDED' ? ['REOPEN'] : value.status === 'CONTESTED' ?
      ['APPROVE', 'VOID', ...(state.responded ? ['CONTEST' as const] : [])] : [];
  value.analysis ??= { version: 0, actions: [], canRespond: false, requestId: null, evidenceRevision: 1, lastReason: null, approval: null, impacts: {} };
  value.analysis.actions = actions;
  value.analysis.canRespond = !state.closed && !state.merchant && value.status === 'CONTESTED' && !state.responded;
  value.analysis.impacts = Object.fromEntries(actions.map(action => {
    const delta = action === 'VOID' && credited ? -15n : action === 'APPROVE' && !credited ? 15n : 0n;
    return [action, { available: state.balance, delta: String(delta), resulting: String(BigInt(state.balance) + delta) }];
  }));
}
export function entry(kind: PointsEntryView['kind'], amount: string, overrides: Partial<PointsEntryView> = {}): PointsEntryView {
  return { id: eventId, storeId: ids.first, participantMembershipId: store().membershipId, submissionId, kind, amount,
    redemptionId: null, rewardName: null, origin: { type: 'SUBMISSION', id: submissionId, name: 'Leitura da ocasião' },
    createdAt: now, actor: { displayName: 'Rafa' }, participant: { displayName: 'Ana' }, activityName: 'Leitura da ocasião',
    path: `${originPath}?evento=${eventId}`, reviewEventId: eventId, compensatesEntryId: null, ...overrides };
}
export function applyDecision(state: ReviewState, body: ReviewBody): ReviewMutation {
  const value = state.current; const fromStatus = value.status;
  const delta = value.analysis!.impacts[body.action]?.delta ?? '0';
  value.status = body.action === 'CONTEST' ? 'CONTESTED' : body.action === 'VOID' ? 'VOIDED' : body.action === 'REOPEN' ? 'PENDING' : 'APPROVED';
  if (body.action === 'VOID') value.pointsState = value.pointsState === 'CREDITED' ? 'REVERSED' : value.pointsState === 'REVERSED' ? 'REVERSED' : 'NONE';
  if (body.action === 'REOPEN') value.pointsState = value.pointsState === 'REVERSED' ? 'REVERSED' : 'PENDING';
  if (body.action === 'APPROVE') { value.pointsState = 'CREDITED'; value.approvedAt ??= now;
    value.analysis!.approval = { mode: 'MANUAL', at: now, author: { displayName: 'Rafa' } }; }
  value.analysis!.version += 1; value.analysis!.lastReason = body.reason || value.analysis!.lastReason;
  if (body.action === 'CONTEST') { value.analysis!.requestId = body.operationId; value.analysis!.evidenceRevision += 1; state.responded = false; }
  if (body.action !== 'CONTEST') state.responded = true;
  state.balance = String(BigInt(state.balance) + BigInt(delta));
  const applied = event(body.action, { id: body.operationId, version: value.analysis!.version, fromStatus, toStatus: value.status, reason: body.reason, delta });
  if (BigInt(delta) !== 0n) {
    const kind = body.action === 'VOID' ? 'ACTIVITY_REVERSAL' : state.entries.length ? 'ACTIVITY_RESTORE' : 'ACTIVITY_CREDIT';
    state.entries.unshift(entry(kind, delta, { id: body.operationId, reviewEventId: body.operationId, path: `${originPath}?evento=${body.operationId}` }));
    applied.pointsEntryId = body.operationId;
  }
  state.events.push(applied); analysis(state);
  const result = { event: applied, submission: structuredClone(value), appliedVersion: applied.version };
  state.operations.set(body.operationId, result); return result;
}
export function applyResponse(state: ReviewState, body: ResponseBody): ReviewMutation {
  state.responded = true; state.current.analysis!.version += 1;
  if (body.evidenceAssetId) state.assets.get(body.evidenceAssetId)!.publishedAt = now;
  const applied = event('RESPOND', { id: body.operationId, version: state.current.analysis!.version, fromStatus: 'CONTESTED', toStatus: 'CONTESTED',
    text: body.text, requestId: body.requestId, evidenceRevision: body.evidenceRevision, evidenceAssetId: body.evidenceAssetId, delta: '0' });
  state.events.push(applied); analysis(state);
  const result = { event: applied, submission: structuredClone(state.current), appliedVersion: applied.version };
  state.operations.set(body.operationId, result); return result;
}
export async function mockReview(page: Page, options: {
  merchant?: boolean; status?: SubmissionView['status']; credited?: boolean; balance?: string; closed?: boolean; handler?: Handler;
} = {}) {
  const current = submission(activity(), submissionId);
  const status = options.status ?? 'PENDING'; const credited = options.credited ?? status === 'APPROVED';
  Object.assign(current, { status, pointsState: credited ? 'CREDITED' : status === 'VOIDED' ? 'REVERSED' : 'PENDING', caption: 'Legenda inicial preservada.',
    receivedAt: now, approvedAt: credited ? now : null, localDate: '2026-10-22', timezone: 'America/Sao_Paulo', review: null,
    snapshot: { ...activity(), activityVersion: 1 }, conversation: { id: conversationId, storeId: ids.first, participantMembershipId: current.participantMembershipId,
      subjectType: 'SUBMISSION', subjectId: submissionId, writable: true },
    analysis: { version: 0, actions: [], canRespond: false, requestId: status === 'CONTESTED' ? eventId : null,
      evidenceRevision: status === 'CONTESTED' ? 2 : 1, lastReason: status === 'CONTESTED' ? 'Conte um pouco mais sobre esta conquista.' : null,
      approval: credited ? { mode: 'AUTOMATIC', at: now, author: { displayName: 'Ana' } } : null, impacts: {} } });
  const state: ReviewState = { current, balance: options.balance ?? (credited ? '15' : '0'), events: [], operations: new Map(), bodies: [], calls: [],
    entries: credited ? [entry('ACTIVITY_CREDIT', '15')] : [], queries: [], assets: new Map(), ready: false,
    merchant: options.merchant ?? true, responded: false, closed: options.closed ?? false };
  analysis(state);
  const fixtures = await mockActivities(page, { merchant: state.merchant, handler: async (route, url) => {
    if (options.handler && await options.handler(route, url, state)) return true;
    const path = url.pathname;
    if (path === `${api}/registros/${submissionId}`) { state.calls.push('GET:submission'); analysis(state); await json(route, state.current); }
    else if (path.endsWith('/analise')) {
      const body = route.request().postDataJSON(); state.bodies.push(body); state.calls.push('POST:review'); await json(route, applyDecision(state, body));
    } else if (path.endsWith('/resposta')) {
      const body = route.request().postDataJSON(); state.bodies.push(body); state.calls.push('POST:response'); await json(route, applyResponse(state, body));
    } else if (path.includes('/operacoes/')) {
      const pieces = path.split('/'); const id = pieces[pieces.length - 1]; state.calls.push('GET:operation'); const found = state.operations.get(id);
      await json(route, found ? { ...found, submission: state.current } : { code: 'resource_not_found', message: 'Operação ainda não confirmada.' }, found ? 200 : 404);
    } else if (path.endsWith('/historico')) {
      const pageNumber = Number(url.searchParams.get('page') ?? '1');
      await json(route, { items: state.events.slice((pageNumber - 1) * 20, pageNumber * 20), total: state.events.length, page: pageNumber, pageSize: 20 });
    } else if (path === `${api}/pontos/movimentos`) {
      state.queries.push(url.searchParams); const kind = url.searchParams.get('kind');
      const items = state.entries.filter(item => !kind || item.kind === kind); const p = Number(url.searchParams.get('page') ?? '1');
      await json(route, { items: items.slice((p - 1) * 20, p * 20), page: p, pageSize: 20, total: items.length });
    } else if (path === `${api}/pontos`) await json(route, { storeId: ids.first, participantMembershipId: current.participantMembershipId,
      available: state.balance, pending: state.current.pointsState === 'PENDING' ? '15' : '0',
      today: { localDate: '2026-10-22', timezone: 'America/Sao_Paulo', submitted: 1, approved: credited ? 1 : 0, credited: credited ? '15' : '0', adjusted: '-15' } });
    else if (path === `${api}/registros`) await json(route, { items: [state.current], page: 1, pageSize: 20, total: 1 });
    else if (path.endsWith('/comentarios')) await json(route, { conversation: state.current.conversation, items: [], page: 1, pageSize: 20, total: 0 });
    else if (path.includes(`/midia/${collectionId}`) || path.includes('/midia/arquivos/')) await media(route, url, state);
    else return false;
    return true;
  } });
  if (state.closed) fixtures.auth.stores[0].state = 'CLOSED';
  return { state, auth: fixtures.auth };
}
async function media(route: Route, url: URL, state: ReviewState) {
  const path = url.pathname; const revision = state.current.analysis!.evidenceRevision;
  if (path.endsWith(`/midia/${collectionId}`)) {
    if (route.request().method() === 'POST') {
      const value = route.request().postDataJSON().files[0];
      state.assets.set(value.operationId, { ...photo(value.operationId, revision), byteLength: value.byteLength, uploadedBytes: 0, state: 'UPLOADING' });
      await json(route, { items: [state.assets.get(value.operationId)] });
    } else {
      const items = [...state.assets.values()].filter(value => value.state !== 'REMOVED').map(value => state.ready ? { ...value, state: 'READY' } : value);
      await json(route, { collection: { id: collectionId, storeId: ids.first, purpose: 'EVIDENCE', revision, writable: state.current.analysis!.canRespond },
        items, page: 1, pageSize: 50, total: items.length });
    }
  } else {
    const id = path.split('/arquivos/')[1]?.split('/')[0]; const asset = state.assets.get(id)!;
    if (path.endsWith('/partes')) asset.uploadedBytes = asset.byteLength;
    if (path.endsWith('/concluir')) asset.state = 'QUEUED';
    if (path.endsWith('/remover')) asset.state = 'REMOVED';
    await json(route, asset);
  }
}
