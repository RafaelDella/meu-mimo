import { adminResults, adminRoutes } from '../admin/diagnostic-types.ts';
import type { DiagnosticEvent } from '../admin/diagnostic-types.ts';

/** Entrada deliberadamente pequena; campos extras nunca participam da serialização. */
export function emitDiagnostic(event: DiagnosticEvent): void {
  if (!event || typeof event !== 'object' || !adminRoutes.includes(event.route) || !adminResults.includes(event.result) ||
      !Number.isInteger(event.status) || event.status < 100 || event.status > 599 ||
      !Number.isFinite(event.durationMs) || event.durationMs < 0 || typeof event.correlationId !== 'string' ||
      !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(event.correlationId)) return;
  const safe: DiagnosticEvent = { route: event.route, result: event.result, status: event.status,
    durationMs: Math.round(event.durationMs), correlationId: event.correlationId };
  console.info(JSON.stringify(safe));
}
