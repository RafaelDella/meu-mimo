'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import type { StoreView } from '@/contracts/stores';
import { Button } from '@/components/ui/button';
import { StoreNavigation } from '@/components/navigation/store-navigation';
import type { StoreSection } from '@/components/navigation/store-navigation';
import { PrivateArea } from './private-area';
import { StoreSettings } from './store-settings';
import { StorePeople } from './store-people';
import { StoreInvitations } from './store-invitations';
import { storeError, useResource } from './store-api';

function Workspace({ storeId, section }: { storeId: string; section: StoreSection }) {
  const frame = useRef<HTMLDivElement>(null);
  const focusAfterRefresh = useRef(false);
  const { data: store, error, loading, refreshing, reload } = useResource<StoreView>(`/api/lojas/${encodeURIComponent(storeId)}`, true);
  function refresh() { focusAfterRefresh.current = true; reload(); }
  useEffect(() => {
    if (loading || refreshing || !focusAfterRefresh.current) return;
    focusAfterRefresh.current = false;
    frame.current?.querySelector<HTMLElement>('h1')?.focus();
  }, [loading, refreshing]);
  if (loading) return <p role="status">Abrindo sua loja…</p>;
  if (error || !store) return <div ref={frame} className="stores-card"><h1 tabIndex={-1}>Loja indisponível</h1>
    <p role="alert">{storeError(error)}</p><div className="stores-actions"><Link className="stores-link" href="/lojas">Minhas lojas</Link>
      <Button variant="secondary" onClick={reload}>Tentar novamente</Button></div></div>;
  const restricted = section !== 'home' && section !== 'people' && store.role !== 'MERCHANT';
  return <div ref={frame} key={`${store.id}:${store.membershipId}`} aria-busy={refreshing}>
    <StoreNavigation store={store} section={section} />
    {store.state !== 'ACTIVE' && <p className="stores-banner" role="status">{store.state === 'PAUSED' ?
      'Esta loja está pausada. Novos convites, conquistas e resgates estão suspensos. O histórico continua acessível.' :
      'Esta loja foi encerrada. Você continua com acesso privado ao histórico e aos mimos já emitidos.'}</p>}
    {store.membershipClosedAt && <p className="stores-banner" role="status">Sua participação foi encerrada. Este cantinho continua disponível para consulta do seu histórico e pendências.</p>}
    {restricted ? <section className="stores-card"><h2>Acesso indisponível</h2><p>Esta área é reservada a quem gerencia a loja.</p></section> :
      section === 'settings' ? <StoreSettings key={store.id} store={store} onUpdate={refresh} /> :
        section === 'people' ? <StorePeople key={store.id} store={store} onUpdate={refresh} /> :
          section === 'invitations' ? <StoreInvitations key={store.id} store={store} /> : <StoreHome store={store} />}
  </div>;
}

function StoreHome({ store }: { store: StoreView }) {
  return <section className="stores-card"><h2>{store.role === 'MERCHANT' ? 'Seu cantinho está aqui' : 'Que bom ter você por aqui'}</h2>
    <p>{store.presentation || 'Uma lojinha de pequenos gestos e conquistas compartilhadas.'}</p>
    <dl className="stores-details"><div><dt>Fuso horário</dt><dd>{store.timezone}</dd></div><div><dt>Estado da loja</dt>
      <dd>{store.state === 'ACTIVE' ? 'Ativa' : store.state === 'PAUSED' ? 'Pausada' : 'Encerrada'}</dd></div></dl>
    {store.role === 'MERCHANT' ? <><p>Cuide da apresentação da sua lojinha e convide quem vai fazer parte dela.</p>
      <div className="stores-actions"><Link className="primary-link" href={`/lojas/${store.id}/convites`}>Convidar pessoa</Link>
        <Link className="stores-link" href={`/lojas/${store.id}/configuracoes`}>Configurar loja</Link></div></> :
      <p>Os seus dados nesta loja ficam entre você e quem oferece os mimos.</p>}
  </section>;
}

export function StoreWorkspace({ storeId, section }: { storeId: string; section: StoreSection }) {
  return <main className="stores-shell"><PrivateArea>{session =>
    <Workspace key={`${session.sessionId}:${storeId}`} storeId={storeId} section={section} />
  }</PrivateArea></main>;
}
