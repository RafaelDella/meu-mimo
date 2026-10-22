'use client';

import type { PointsBalance } from '@/contracts/activities';
import { useResource, storeError } from '@/components/stores/store-api';
import type { StoreRequestError } from '@/components/stores/store-api';
import { PointsSummary } from '@/components/ui/points-summary';
import { Button } from '@/components/ui/button';
import { useStatementAccess } from './use-statement-access';

export function StatementBalance({ storeId, storeName, membershipId, onUnavailable }: {
  storeId: string; storeName: string; membershipId: string; onUnavailable: (cause: StoreRequestError) => void;
}) {
  const { data, loading, error, reload } = useResource<PointsBalance>(`/api/lojas/${encodeURIComponent(storeId)}/pontos${membershipId ? `?membershipId=${encodeURIComponent(membershipId)}` : ''}`);
  const denied = useStatementAccess(error, onUnavailable);
  if (denied) return null;
  return <>{loading && <p role="status">Consultando o saldo desta participação…</p>}
    {error ? <div role="alert"><p>{storeError(error)}</p><Button variant="secondary" onClick={reload}>Consultar saldo novamente</Button></div> : null}
    {data && <><PointsSummary storeName={storeName} available={data.available} pending={data.pending} />
      {BigInt(data.available) < 0n && <p role="status">Este saldo está negativo por ajustes registrados no extrato. Os tickets já emitidos continuam válidos. Novos resgates dependerão de saldo suficiente.</p>}</>}
  </>;
}
