import type { Metadata } from 'next';
import Link from 'next/link';
import { AccountPanel } from './account-panel';

export const metadata: Metadata = {
  title: 'Sua conta · Meu Mimo',
  robots: { index: false, follow: false },
};

export default function AccountPage() {
  return (
    <main className="account-shell">
      <header className="account-header">
        <Link className="preview-brand" href="/">meu mimo<span className="brand-dot">.</span></Link>
        <h1>Seu cantinho de carinho</h1>
        <p>Entre na sua conta para continuar os pequenos gestos de vocês.</p>
      </header>
      <AccountPanel />
    </main>
  );
}
