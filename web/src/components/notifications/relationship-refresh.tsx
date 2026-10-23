'use client';

import { createContext, useContext, useEffect, useMemo } from 'react';
import type { ReactNode } from 'react';
import { storeRequest } from '@/components/stores/store-api';

type Listener = () => Promise<void> | void;
type Coordinator = { subscribe(path: string, listener: Listener): () => void; refresh(): void; request<T>(path: string): Promise<T>; abort(): void };
const RefreshContext = createContext<Coordinator | null>(null);
export function invalidateRelationship() { window.dispatchEvent(new Event('meumimo:relationship-changed')); }

// Um relógio para o contexto, com uma consulta em voo por recurso. Os assinantes
// mantêm seus próprios dados e abortam-nos quando a conta/loja é desmontada.
export function RelationshipRefresh({ accountKey, storeId = '', children }: { accountKey: string; storeId?: string; children: ReactNode }) {
  const coordinator = useMemo<Coordinator>(() => {
    const scope = `${accountKey}:${storeId}`;
    const subscribers = new Map<string, Set<Listener>>();
    const running = new Set<Listener>();
    const requests = new Map<string, { controller: AbortController; promise: Promise<unknown> }>();
    return {
      request<T>(path: string) {
        const key = `${scope}:${path}`;
        const existing = requests.get(key); if (existing) return existing.promise as Promise<T>;
        const controller = new AbortController();
        const promise = storeRequest<T>(path, 'GET', undefined, controller.signal).finally(() => {
          if (requests.get(key)?.controller === controller) requests.delete(key);
        });
        requests.set(key, { controller, promise }); return promise;
      },
      abort() { for (const { controller } of requests.values()) controller.abort(); requests.clear(); },
      subscribe(path, listener) {
        const listeners = subscribers.get(path) ?? new Set<Listener>(); listeners.add(listener); subscribers.set(path, listeners);
        return () => { listeners.delete(listener); if (!listeners.size) subscribers.delete(path); };
      },
      refresh() {
        if (document.visibilityState !== 'visible' || !navigator.onLine) return;
        for (const listeners of subscribers.values()) for (const listener of listeners) {
          if (running.has(listener)) continue;
          running.add(listener); void Promise.resolve(listener()).finally(() => running.delete(listener));
        }
      },
    };
  }, [accountKey, storeId]);
  useEffect(() => {
    const refresh = () => coordinator.refresh();
    const timer = window.setInterval(refresh, 30_000);
    window.addEventListener('focus', refresh); window.addEventListener('online', refresh);
    window.addEventListener('meumimo:relationship-changed', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      coordinator.abort();
      window.clearInterval(timer); window.removeEventListener('focus', refresh); window.removeEventListener('online', refresh);
      window.removeEventListener('meumimo:relationship-changed', refresh); document.removeEventListener('visibilitychange', refresh);
    };
  }, [coordinator]);
  return <RefreshContext.Provider value={coordinator}>{children}</RefreshContext.Provider>;
}
export function useRelationshipRefresh() { return useContext(RefreshContext); }
