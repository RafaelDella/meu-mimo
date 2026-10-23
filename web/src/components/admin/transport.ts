'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { StoreRequestError, storeRequest } from '@/components/stores/store-api';

export const AdminAccessContext = createContext<(cause: unknown) => void>(() => undefined);
export function useAdminAccess() { return useContext(AdminAccessContext); }
export function adminDenied(cause: unknown): cause is StoreRequestError {
  return cause instanceof StoreRequestError && [401, 403].includes(cause.status);
}
export async function adminRequest<T>(path: string, method = 'GET', body?: object, signal?: AbortSignal): Promise<T> {
  const deadline = new AbortController();
  const timer = window.setTimeout(() => deadline.abort(), 20_000);
  try {
    return await storeRequest<T>(path, method, body, signal ? AbortSignal.any([signal, deadline.signal]) : deadline.signal);
  } finally { window.clearTimeout(timer); }
}
export function invalidateAdmin() { window.dispatchEvent(new Event('meumimo:admin-changed')); window.dispatchEvent(new Event('meumimo:relationship-changed')); }
export function useAdminResource<T>(path: string, body?: object) {
  const unavailable = useAdminAccess(); const serialized = body ? JSON.stringify(body) : '';
  const [revision, setRevision] = useState(0); const key = `${path}:${serialized}:${revision}`;
  const [result, setResult] = useState<{ key: string; data?: T; error?: unknown }>();
  const reload = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    adminRequest<T>(path, serialized ? 'POST' : 'GET', serialized ? JSON.parse(serialized) as object : undefined, controller.signal)
      .then(data => { if (!controller.signal.aborted) setResult({ key, data }); })
      .catch(error => { if (!controller.signal.aborted) { unavailable(error); setResult({ key, error }); } });
    return () => controller.abort();
  }, [path, serialized, key, unavailable]);
  useEffect(() => { window.addEventListener('meumimo:admin-changed', reload); return () => window.removeEventListener('meumimo:admin-changed', reload); }, [reload]);
  const current = result?.key === key ? result : undefined;
  return { data: current?.data, error: current?.error, loading: !current, reload };
}
