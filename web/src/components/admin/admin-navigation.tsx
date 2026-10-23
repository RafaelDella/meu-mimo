import Link from 'next/link';
import styles from './admin.module.css';

export function AdminNavigation({ section }: { section: 'overview' | 'accounts' | 'stores' }) {
  return <header className={styles.stack}><div className={styles.actions}><Link className="stores-link" href="/lojas">Voltar para minhas lojas</Link><Link className="stores-link" href="/conta">Minha conta</Link></div>
    <h1>Administração</h1><p>Metadados e controles da plataforma. O conteúdo das relações permanece privado.</p>
    <nav className={styles.nav} aria-label="Administração"><Link href="/admin" aria-current={section === 'overview' ? 'page' : undefined}>Visão geral</Link>
      <Link href="/admin/contas" aria-current={section === 'accounts' ? 'page' : undefined}>Contas</Link><Link href="/admin/lojas" aria-current={section === 'stores' ? 'page' : undefined}>Lojas</Link></nav>
  </header>;
}
