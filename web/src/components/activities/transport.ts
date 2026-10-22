'use client';

import type { ActivityFields, ActivityMutation, ActivityPage, ActivityView, PointsBalance, PointsEntryView, SubmissionPage, SubmissionView } from '@/contracts/activities';
import type { PageResult } from '@/contracts/stores';
import { StoreRequestError, storeRequest } from '@/components/stores/store-api';

export type SubmissionBody = {
  caption: string; evidenceAssetId: string | null; expectedVersion: number;
  expectedLocalDate: string; expectedTimezone: string;
};
export type ActivityRoute = { view: 'list' } | { view: 'new' } |
  { view: 'detail' | 'edit' | 'register'; activityId: string; draftId?: string } |
  { view: 'submission'; submissionId: string };
export function base(storeId: string) { return `/api/lojas/${encodeURIComponent(storeId)}`; }
export function activityPath(storeId: string, activityId?: string) {
  return `/lojas/${encodeURIComponent(storeId)}/atividades${activityId ? `/${encodeURIComponent(activityId)}` : ''}`;
}
export const activityApi = {
  list: (storeId: string, query: URLSearchParams, signal: AbortSignal) => storeRequest<ActivityPage>(`${base(storeId)}/atividades?${query}`, 'GET', undefined, signal),
  get: (storeId: string, id: string, signal: AbortSignal) => storeRequest<ActivityView>(`${base(storeId)}/atividades/${encodeURIComponent(id)}`, 'GET', undefined, signal),
  create: (storeId: string, body: ActivityFields & { operationId: string }, signal: AbortSignal) => storeRequest<ActivityMutation>(`${base(storeId)}/atividades`, 'POST', body, signal),
  update: (storeId: string, id: string, body: ActivityFields & { operationId: string; expectedVersion: number }, signal: AbortSignal) => storeRequest<ActivityMutation>(`${base(storeId)}/atividades/${encodeURIComponent(id)}`, 'PATCH', body, signal),
  archive: (storeId: string, id: string, body: { operationId: string; expectedVersion: number }, signal: AbortSignal) => storeRequest<ActivityMutation>(`${base(storeId)}/atividades/${encodeURIComponent(id)}/arquivar`, 'POST', body, signal),
  submissions: (storeId: string, query: URLSearchParams, signal: AbortSignal) => storeRequest<SubmissionPage>(`${base(storeId)}/registros?${query}`, 'GET', undefined, signal),
  prepare: (storeId: string, id: string, operationId: string, signal: AbortSignal) => storeRequest<SubmissionView>(`${base(storeId)}/atividades/${encodeURIComponent(id)}/preparar`, 'POST', { operationId }, signal),
  submission: (storeId: string, id: string, signal: AbortSignal) => storeRequest<SubmissionView>(`${base(storeId)}/registros/${encodeURIComponent(id)}`, 'GET', undefined, signal),
  send: (storeId: string, id: string, body: SubmissionBody, signal: AbortSignal) => storeRequest<SubmissionView>(`${base(storeId)}/registros/${encodeURIComponent(id)}/enviar`, 'POST', body, signal),
  points: (storeId: string, signal: AbortSignal) => storeRequest<PointsBalance>(`${base(storeId)}/pontos`, 'GET', undefined, signal),
  movements: (storeId: string, page: number, signal: AbortSignal) => storeRequest<PageResult<PointsEntryView>>(`${base(storeId)}/pontos/movimentos?page=${page}`, 'GET', undefined, signal),
};
export function privacyError(error: unknown) {
  return error instanceof StoreRequestError && [401, 403, 404].includes(error.status);
}
