import type { Metadata } from 'next';
import { AccountPanel } from './account-panel';
import { MimoMasthead } from '@/components/ui/mimo-page';

export const metadata: Metadata = {
  title: 'Sua conta · Meu Mimo',
  robots: { index: false, follow: false },
};

export default function AccountPage() {
  return (
    <main className="account-shell">
      <MimoMasthead />
      <AccountPanel />
    </main>
  );
}
