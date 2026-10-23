import { AppError } from './errors.ts';

type RequestLifecycle = { accepting: boolean; pending: Set<Promise<unknown>> };
const runtime = globalThis as typeof globalThis & { meuMimoRequestLifecycle?: RequestLifecycle };

/** Optional process-local coordination shared by the custom host and bundled API routes. */
export function openRequestLifecycle(): { closeAdmission: () => void; drain: () => Promise<void> } {
  if (runtime.meuMimoRequestLifecycle) throw new Error('REQUEST_LIFECYCLE_ALREADY_OPEN');
  const state: RequestLifecycle = { accepting: true, pending: new Set() };
  runtime.meuMimoRequestLifecycle = state;
  const closeAdmission = () => { state.accepting = false; };
  return { closeAdmission, drain: async () => {
    closeAdmission();
    while (state.pending.size) await Promise.allSettled([...state.pending]);
    // Keep admission closed for any framework callback that reaches the API after HTTP has closed.
  } };
}

export function trackRequestOperation<T>(operation: () => Promise<T>): Promise<T> {
  const state = runtime.meuMimoRequestLifecycle;
  if (!state) return operation();
  if (!state.accepting) throw new AppError('service_unavailable', 503, 'A aplicação está encerrando. Tente novamente em instantes.');
  // Register before invoking the operation, including synchronous throws and nested async work.
  const unit = Promise.resolve().then(operation);
  state.pending.add(unit);
  void unit.then(() => { state.pending.delete(unit); }, () => { state.pending.delete(unit); });
  return unit;
}
