'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { MediaAccess, MediaVariant } from '@/contracts/media';
import { mediaTransport } from '@/components/media/transport';
import { useRewardAccess } from '@/components/rewards/access';
import { StoreRequestError, storeError } from '@/components/stores/store-api';

export function useAlbumGrant(storeId: string, assetId: string, variant: MediaVariant) {
  const [grant, setGrant] = useState<MediaAccess>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const active = useRef<AbortController | null>(null);
  const unavailable = useRewardAccess();
  useEffect(() => () => {
    const controller = active.current;
    active.current = null;
    controller?.abort();
  }, []);
  useEffect(() => {
    if (!grant) return;
    const timer = setTimeout(() => {
      setGrant(undefined); setError('Leitura temporária expirada. Renove o acesso para continuar.');
    }, Math.max(0, Date.parse(grant.expiresAt) - Date.now()));
    return () => clearTimeout(timer);
  }, [grant]);
  const open = useCallback(async () => {
    if (active.current) return;
    const controller = new AbortController(); active.current = controller; setBusy(true); setError('');
    try {
      const result = await mediaTransport.access({ storeId, collectionId: '' }, assetId, variant, controller.signal);
      if (!controller.signal.aborted) setGrant(result);
    } catch (cause) { if (!controller.signal.aborted) { unavailable(cause); setError(storeError(cause)); } }
    finally {
      if (active.current === controller) {
        active.current = null;
        if (!controller.signal.aborted) setBusy(false);
      }
    }
  }, [storeId, assetId, variant, unavailable]);
  async function contentFailure() {
    if (!grant || active.current) return;
    const controller = new AbortController(); active.current = controller;
    const url = grant.url; setGrant(undefined);
    try {
      const response = await fetch(url, { signal: controller.signal, cache: 'no-store', credentials: 'same-origin', headers: { Range: 'bytes=0-0' } });
      await response.body?.cancel();
      if (!response.ok) throw new StoreRequestError('media_unavailable', response.status,
        response.status === 410 ? 'Leitura temporária expirada. Renove o acesso para continuar.' : 'O conteúdo deste momento não está disponível.');
      if (!controller.signal.aborted) setError('Não foi possível reproduzir este momento. Renove o acesso para tentar novamente.');
    } catch (cause) { if (!controller.signal.aborted) { unavailable(cause); setError(storeError(cause)); } }
    finally { if (active.current === controller) active.current = null; }
  }
  return { grant, error, busy, open, contentFailure, close: () => setGrant(undefined) };
}
