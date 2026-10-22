'use client';

import type { ResponseBody, ReviewBody, ReviewMutation, SubmissionHistory, SubmissionView } from '@/contracts/activities';
import { storeRequest } from '@/components/stores/store-api';

export type ReviewContext = { storeId: string; submissionId: string };
export function submissionBase(context: ReviewContext) {
  return `/api/lojas/${encodeURIComponent(context.storeId)}/registros/${encodeURIComponent(context.submissionId)}`;
}
export const reviewApi = {
  submission: (context: ReviewContext, signal: AbortSignal) => storeRequest<SubmissionView>(submissionBase(context), 'GET', undefined, signal),
  review: (context: ReviewContext, body: ReviewBody, signal: AbortSignal) => storeRequest<ReviewMutation>(`${submissionBase(context)}/analise`, 'POST', body, signal),
  respond: (context: ReviewContext, body: ResponseBody, signal: AbortSignal) => storeRequest<ReviewMutation>(`${submissionBase(context)}/resposta`, 'POST', body, signal),
  operation: (context: ReviewContext, id: string, signal: AbortSignal) => storeRequest<ReviewMutation>(`${submissionBase(context)}/operacoes/${encodeURIComponent(id)}`, 'GET', undefined, signal),
  history: (context: ReviewContext, page: number, signal: AbortSignal) => storeRequest<SubmissionHistory>(`${submissionBase(context)}/historico?page=${page}`, 'GET', undefined, signal),
};
