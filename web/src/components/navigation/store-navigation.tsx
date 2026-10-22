import Link from 'next/link';
import type { StoreView } from '@/contracts/stores';

export type StoreSection = 'home' | 'activities' | 'people' | 'invitations' | 'settings';
export function StoreNavigation({ store, section }: { store: StoreView; section: StoreSection }) {
  const base = `/lojas/${store.id}`;
  const links: { section: StoreSection; href: string; label: string }[] = store.role === 'MERCHANT' ? [
    { section: 'home', href: base, label: 'Resumo' },
    { section: 'activities', href: `${base}/atividades`, label: 'Atividades' },
    { section: 'people', href: `${base}/pessoas`, label: 'Pessoas' },
    { section: 'invitations', href: `${base}/convites`, label: 'Convites' },
    { section: 'settings', href: `${base}/configuracoes`, label: 'Configurações' },
  ] : [
    { section: 'home', href: base, label: 'Lojinha' },
    { section: 'activities', href: `${base}/atividades`, label: 'Atividades' },
    { section: 'people', href: `${base}/pessoas`, label: 'Minha participação' },
  ];
  return <header className="store-context">
    <div className="stores-account-links"><Link href="/lojas">Minhas lojas</Link><Link href="/conta">Minha conta</Link></div>
    <div className="store-identity"><span className="stores-mark" aria-hidden="true">♡</span>
      <div><p>{store.role === 'MERCHANT' ? 'Gerenciando' : 'Participando'}</p><h1 tabIndex={-1}>{store.name || 'Sua lojinha'}</h1></div></div>
    <Link className="stores-link" href="/lojas">Trocar loja</Link>
    <nav className="store-local-nav" aria-label={store.role === 'MERCHANT' ? 'Gestão da loja' : 'Sua participação'}>
      {links.map(link => <Link key={link.section} href={link.href} aria-current={section === link.section ? 'page' : undefined}>{link.label}</Link>)}
    </nav>
  </header>;
}
