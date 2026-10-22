'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { StoreRequestError, useResource } from '@/components/stores/store-api';

const AccessContext = createContext<((cause: unknown) => void) | null>(null);
const ignore = () => undefined;
export function accessDenied(cause: unknown): cause is StoreRequestError {
  return cause instanceof StoreRequestError && [401, 403, 404].includes(cause.status);
}
export function RewardAccess({ children }: { children: ReactNode }) {
  const parent = useContext(AccessContext);
  const [denied, setDenied] = useState(false);
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (denied) title.current?.focus(); }, [denied]);
  const unavailable = useCallback((cause: unknown) => {
    if (!accessDenied(cause)) return;
    setDenied(true);
    if (parent) parent(cause);
    else if (cause.status === 401) window.dispatchEvent(new Event('meumimo:session-changed'));
  }, [parent]);
  return <AccessContext.Provider value={unavailable}>{denied ? <section className="stores-card">
    <h2 ref={title} tabIndex={-1}>Mimos indisponíveis</h2><p role="alert">O acesso a este conteúdo não está disponível para esta conta. Reabra uma loja autorizada para continuar.</p>
  </section> : children}</AccessContext.Provider>;
}
export function useRewardAccess() { return useContext(AccessContext) ?? ignore; }
export function useRewardResource<T>(path: string) {
  const resource = useResource<T>(path);
  const unavailable = useRewardAccess();
  useEffect(() => { unavailable(resource.error); }, [resource.error, unavailable]);
  return { ...resource, denied: accessDenied(resource.error) };
}
