import type { Metadata } from 'next';
import { AccountPanel } from './account-panel';
import { MimoIntro, MimoMasthead } from '@/components/ui/mimo-page';

export const metadata: Metadata = {
  title: 'Sua conta · Meu Mimo',
  robots: { index: false, follow: false },
};

export default function AccountPage() {
  return (
    <main className="account-shell">
      <MimoMasthead />
      <div className="account-layout">
      <header className="account-header">
        <MimoIntro kind="kitten">
        <p className="mimo-eyebrow">Um cantinho só de vocês</p>
        <h1>Seu cantinho de carinho</h1>
        <p>Entre na sua conta para continuar os pequenos gestos de vocês.</p>
        </MimoIntro>
        <p className="account-little-note">Pequenas conquistas, grandes carinhos.</p>
      </header>
      <AccountPanel />
      </div>
    </main>
  );
}
