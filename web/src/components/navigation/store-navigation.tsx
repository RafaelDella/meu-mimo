'use client';

import Link from 'next/link';
import { useId } from 'react';
import type { StoreView } from '@/contracts/stores';
import { useTicketSummary } from '@/components/rewards/reward-summary';
import { Button } from '@/components/ui/button';

export type StoreSection = 'home' | 'activities' | 'statement' | 'rewards' | 'tickets' | 'people' | 'invitations' | 'settings';
export function StoreNavigation({ store, section }: { store: StoreView; section: StoreSection }) {
  const countId = useId();
  const summary = useTicketSummary();
  const base = `/lojas/${store.id}`;
  const links: { section: StoreSection; href: string; label: string }[] = store.role === 'MERCHANT' ? [
    { section: 'home', href: base, label: 'Resumo' },
    { section: 'activities', href: `${base}/atividades`, label: 'Atividades' },
    { section: 'rewards', href: `${base}/mimos`, label: 'Mimos' },
    { section: 'statement', href: `${base}/extrato`, label: 'Extrato' },
    { section: 'people', href: `${base}/pessoas`, label: 'Pessoas' },
    { section: 'invitations', href: `${base}/convites`, label: 'Convites' },
    { section: 'settings', href: `${base}/configuracoes`, label: 'Configurações' },
  ] : [
    { section: 'home', href: base, label: 'Lojinha' },
    { section: 'activities', href: `${base}/atividades`, label: 'Atividades' },
    { section: 'tickets', href: `${base}/tickets`, label: 'Meus mimos' },
  ];
  return <header className="store-context">
    <div className="stores-account-links"><Link href="/lojas">Minhas lojas</Link><Link href="/conta">Minha conta</Link></div>
    <div className="store-identity"><span className="stores-mark" aria-hidden="true">♡</span>
      <div><p>{store.role === 'MERCHANT' ? 'Gerenciando' : 'Participando'}</p><h1 tabIndex={-1}>{store.name || 'Sua lojinha'}</h1></div></div>
    <Link className="stores-link" href="/lojas">Trocar loja</Link>
    {store.role === 'PARTICIPANT' && <Link className="stores-link" href={`${base}/pessoas`} aria-current={section === 'people' ? 'page' : undefined}>Minha participação</Link>}
    <nav className="store-local-nav" aria-label={store.role === 'MERCHANT' ? 'Gestão da loja' : 'Sua participação'}>
      {links.map(link => <Link key={link.section} href={link.href} aria-label={link.section === 'tickets' ? 'Meus mimos' : undefined}
        aria-describedby={link.section === 'tickets' && summary?.data ? countId : undefined}
        aria-current={section === link.section || (store.role === 'MERCHANT' && section === 'tickets' && link.section === 'rewards') ||
          (store.role === 'PARTICIPANT' && ((section === 'statement' && link.section === 'tickets') || (section === 'rewards' && link.section === 'home'))) ? 'page' : undefined}>
        {link.label}{link.section === 'tickets' && summary?.data && <span aria-hidden="true"> · {summary.data.outstanding}</span>}</Link>)}
    </nav>
    {store.role === 'PARTICIPANT' && summary?.data && <p id={countId} className="stores-muted">{summary.data.outstanding} {summary.data.outstanding === 1 ? 'mimo ainda a realizar' : 'mimos ainda a realizar'}.</p>}
    {summary?.error && !summary.denied ? <div role="alert"><p>O contador de mimos não está disponível agora.</p>
      <Button variant="secondary" onClick={summary.reload}>Atualizar contador da navegação</Button></div> : null}
  </header>;
}
