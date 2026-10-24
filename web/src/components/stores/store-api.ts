'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export class StoreRequestError extends Error {
  code: string;
  status: number;
  retryAfter?: number;
  constructor(code: string, status: number, message: string, retryAfter?: number) {
    super(message);
    this.name = 'StoreRequestError';
    this.code = code;
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

function retryAfterSeconds(value: string | null): number | undefined {
  if (!value) return undefined;
  if (/^\d+$/.test(value)) return Number.isFinite(Number(value)) ? Number(value) : undefined;
  const deadline = Date.parse(value);
  return Number.isFinite(deadline) ? Math.max(0, Math.ceil((deadline - Date.now()) / 1000)) : undefined;
}

export async function storeRequest<T>(path: string, method = 'GET', body?: object, signal?: AbortSignal,
  options?: { notifyChange?: boolean }): Promise<T> {
  const response = await fetch(path, {
    method, signal, cache: 'no-store', credentials: 'same-origin',
    ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
  });
  const value: unknown = await response.json();
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Resposta indisponível.');
  if (!response.ok) {
    const failure = value && typeof value === 'object' ? value as Record<string, unknown> : {};
    throw new StoreRequestError(typeof failure.code === 'string' ? failure.code : 'request_failed', response.status,
      typeof failure.message === 'string' ? failure.message : 'Não foi possível continuar agora.',
      retryAfterSeconds(response.headers.get('Retry-After')));
  }
  if (options?.notifyChange !== false && typeof window !== 'undefined' && ['POST', 'PATCH', 'PUT', 'DELETE'].includes(method.toUpperCase()) &&
      !/\/(?:lida|acesso|partes|concluir)(?:\?|$)/.test(path)) {
    window.dispatchEvent(new Event('meumimo:relationship-changed'));
  }
  return value as T;
}

export function storeError(cause: unknown) {
  return cause instanceof StoreRequestError ? cause.message :
    'Não foi possível confirmar o resultado. Confira sua conexão e tente novamente.';
}

export function useResource<T>(path: string, retainDuringRefresh = false) {
  const [revision, setRevision] = useState(0);
  const key = `${path}:${revision}`;
  const [result, setResult] = useState<{ key: string; path: string; value?: T; error?: unknown }>();
  const reload = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    storeRequest<T>(path, 'GET', undefined, controller.signal)
      .then(value => { if (!controller.signal.aborted) setResult({ key, path, value }); })
      .catch(error => { if (!controller.signal.aborted) setResult({ key, path, error }); });
    return () => controller.abort();
  }, [path, key]);
  const current = result?.key === key || (retainDuringRefresh && result?.path === path) ? result : undefined;
  return { data: current?.value, error: current?.error, loading: !current, refreshing: !!current && current.key !== key, reload };
}

export function useStoreAction() {
  const active = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => () => active.current?.abort(), []);
  async function run<T>(operation: (signal: AbortSignal) => Promise<T>, success: (value: T) => void) {
    if (active.current) return;
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const value = await operation(controller.signal);
      if (!controller.signal.aborted) success(value);
    } catch (cause) {
      if (!controller.signal.aborted) setError(storeError(cause));
    } finally {
      if (!controller.signal.aborted) { active.current = null; setBusy(false); }
    }
  }
  return { busy, error, message, setMessage, run };
}
