'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { storeRequest } from '@/components/stores/store-api';
import { accessDenied, useRewardAccess } from '@/components/rewards/access';
import { useRelationshipRefresh } from './relationship-refresh';

export function useRelationshipResource<T>(path: string, enabled = true) {
  const coordinator = useRelationshipRefresh();
  const unavailable = useRewardAccess();
  const [result, setResult] = useState<{ path: string; data?: T; error?: unknown; refreshing?: boolean }>();
  const active = useRef<AbortController | null>(null);
  const queued = useRef(false); const latestLoad = useRef<(() => Promise<void>) | null>(null);
  const load = useCallback(async () => {
    if (active.current) { queued.current = true; return; }
    const controller = new AbortController(); active.current = controller;
    setResult(value => value?.path === path ? { ...value, refreshing: true } : undefined);
    try {
      const data = coordinator ? await coordinator.request<T>(path) : await storeRequest<T>(path, 'GET', undefined, controller.signal);
      if (!controller.signal.aborted) setResult({ path, data });
    } catch (error) {
      if (!controller.signal.aborted) {
        unavailable(error);
        setResult(value => !accessDenied(error) && value?.path === path ? { path, data: value.data, error } : { path, error });
      }
    } finally {
      if (active.current === controller) {
        active.current = null;
        if (queued.current && !controller.signal.aborted) { queued.current = false; queueMicrotask(() => { void latestLoad.current?.(); }); }
      }
    }
  }, [path, unavailable, coordinator]);
  useEffect(() => { latestLoad.current = load; }, [load]);
  useEffect(() => {
    if (!enabled) return;
    void load();
    const unsubscribe = coordinator?.subscribe(path, load);
    return () => { unsubscribe?.(); queued.current = false; const controller = active.current; active.current = null; controller?.abort(); };
  }, [path, load, coordinator, enabled]);
  const current = result?.path === path ? result : undefined;
  return { data: current?.data, error: current?.error, refreshing: !!current?.refreshing,
    loading: enabled && !current, denied: accessDenied(current?.error), reload: load };
}
