'use client';

import Link from 'next/link';
import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import type { PointsBalance } from '@/contracts/activities';
import type { TicketSummary } from '@/contracts/redemptions';
import type { StoreView } from '@/contracts/stores';
import { PointsSummary } from '@/components/ui/points-summary';
import { Button } from '@/components/ui/button';
import { storeError } from '@/components/stores/store-api';
import { useRelationshipResource } from '@/components/notifications/use-relationship-resource';
import { apiBase, ticketPath } from './transport';

type SummaryResource = ReturnType<typeof useRelationshipResource<TicketSummary>>;
const SummaryContext = createContext<SummaryResource | null>(null);
export function useTicketSummary() { return useContext(SummaryContext); }
export function TicketSummaryProvider({ store, children }: { store: StoreView; children: ReactNode }) {
  const summary = useRelationshipResource<TicketSummary>(`${apiBase(store.id)}/tickets/resumo`);
  return <SummaryContext.Provider value={summary}>{children}</SummaryContext.Provider>;
}

export function RewardBalance({ store }: { store: StoreView }) {
  const { data, error, loading, denied, reload } = useRelationshipResource<PointsBalance>(`${apiBase(store.id)}/pontos`);
  if (denied) return null;
  return <>{loading && <p role="status">Consultando seu potinho…</p>}{error ? <div role="alert"><p>{storeError(error)}</p>
    <Button variant="secondary" onClick={reload}>Consultar saldo novamente</Button></div> : null}
    {data && <><PointsSummary storeName={store.name || 'Sua lojinha'} available={data.available} pending={data.pending} />
      {BigInt(data.available) < 0n && <p role="status">Seu saldo está negativo por ajustes registrados no extrato. Os tickets já emitidos continuam válidos. Novos resgates dependem de saldo suficiente.</p>}</>}
    <Link className="stores-link" href={`/lojas/${store.id}/extrato`}>Ver extrato de pontos</Link></>;
}
export function RewardCounter({ store, showTotal = false }: { store: StoreView; showTotal?: boolean }) {
  const summary = useTicketSummary();
  return summary ? <Counter store={store} summary={summary} showTotal={showTotal} /> : <LoadCounter store={store} showTotal={showTotal} />;
}
function LoadCounter({ store, showTotal }: { store: StoreView; showTotal: boolean }) {
  const summary = useRelationshipResource<TicketSummary>(`${apiBase(store.id)}/tickets/resumo`);
  return <Counter store={store} summary={summary} showTotal={showTotal} />;
}
function Counter({ store, summary, showTotal }: { store: StoreView; summary: SummaryResource; showTotal: boolean }) {
  const { data, error, loading, denied, reload } = summary;
  if (denied) return null;
  return <section aria-label="Mimos ainda a realizar">{loading && <p role="status">Consultando tickets a realizar…</p>}
    {error ? <div role="alert"><p>{storeError(error)}</p><Button variant="secondary" onClick={reload}>Consultar contador novamente</Button></div> : null}
    {data && <><p><strong>{data.outstanding}</strong> {data.outstanding === 1 ? 'mimo ainda a realizar' : 'mimos ainda a realizar'}. O contador considera {store.role === 'MERCHANT' ? 'os tickets pendentes desta loja' : 'todos os seus tickets pendentes'}, independentemente dos filtros.</p>
      {showTotal && <p>Total histórico: <strong>{data.total}</strong> {data.total === 1 ? 'ticket emitido' : 'tickets emitidos'}.</p>}</>}
    <Link className="stores-link" href={ticketPath(store.id)}>{store.role === 'MERCHANT' ? 'Consultar resgates' : 'Ver meus tickets'}</Link></section>;
}
