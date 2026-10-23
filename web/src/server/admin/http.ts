import '../only.ts';
import { randomUUID } from 'node:crypto';
import { emitDiagnostic } from '../audit/diagnostics.ts';
import { handleRoute } from '../http.ts';
import type { AdminResultCode, AdminRouteCode } from './diagnostic-types.ts';
export type { AdminResultCode, AdminRouteCode, DiagnosticEvent } from './diagnostic-types.ts';

function resultCode(status: number): AdminResultCode {
  if (status >= 200 && status < 300) return 'OK';
  if (status === 401) return 'UNAUTHENTICATED';
  if (status === 403) return 'FORBIDDEN';
  if (status === 404) return 'NOT_FOUND';
  if (status === 409) return 'CONFLICT';
  if (status === 429) return 'RATE_LIMITED';
  if ([400, 413, 415].includes(status)) return 'INVALID_INPUT';
  return 'UNAVAILABLE';
}

export async function handleAdminRoute(route: AdminRouteCode, operation: () => Promise<Response>): Promise<Response> {
  const started = performance.now(); const correlationId = randomUUID();
  const response = await handleRoute(operation);
  emitDiagnostic({ route, result: resultCode(response.status), status: response.status,
    durationMs: Math.max(0, performance.now() - started), correlationId });
  return response;
}
