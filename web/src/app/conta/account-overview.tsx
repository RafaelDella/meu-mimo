'use client';

import Link from 'next/link';
import type { Ref } from 'react';
import type { AccountSession } from './account-api';
import { Button } from '@/components/ui/button';
import { MimoIcon } from '@/components/ui/mimo-icon';
import { MimoIntro } from '@/components/ui/mimo-page';
import { StatusBadge } from '@/components/ui/status-badge';
import { NotificationSettingsSection } from '@/components/notifications/notification-preferences';
import { AdminEntry } from '@/components/admin/admin-entry';
import { ProfilePanel } from './profile-panel';
import { MfaPanel } from './mfa-panel';
import styles from './account-overview.module.css';

type Props = {
  session: AccountSession; checking: boolean; busy: boolean; message: string; error: string;
  headingRef: Ref<HTMLHeadingElement>; onLogout: () => void; onVerified: () => Promise<void>;
};

export function AccountOverview({ session, checking, busy, message, error, headingRef, onLogout, onVerified }: Props) {
  const accountKey = `${session.userId}:${session.sessionId}`;
  return <div className={styles.overview} aria-busy={checking || busy}>
    <header className={styles.header}>
      <nav className={styles.navigation} aria-label="Navegação da conta">
        <Link href="/lojas"><MimoIcon name="home" />Minhas lojas</Link>
        <Link href="/notificacoes"><MimoIcon name="mail" />Novidades</Link>
      </nav>
      <MimoIntro kind="journal"><p className="mimo-eyebrow">Tudo no seu cantinho</p>
        <h1 id="account-title" ref={headingRef} tabIndex={-1}>Minha conta</h1>
        <p>Seu perfil, sua segurança e o jeito de receber novidades de cada lojinha.</p>
      </MimoIntro>
      <p className="account-feedback" role="status" aria-live="polite" aria-atomic="true">{checking ? 'Conferindo sua conta…' : message}</p>
      <p className="account-error" role="alert">{error}</p>
    </header>
    <div className={styles.grid} hidden={checking} inert={checking}>
      <div className={styles.main}>
        <div className={styles.card}><ProfilePanel key={accountKey} /></div>
        <div className={styles.card}><NotificationSettingsSection key={`notices:${accountKey}`} accountKey={accountKey} /></div>
      </div>
      <div className={styles.support}>
        <div className={`${styles.card} ${styles.security}`}>
          <MimoIcon name="lock" className={styles.sectionIcon} />
          <MfaPanel key={accountKey} verified={session.assuranceLevel === 'aal2'} onVerified={onVerified} />
          <AdminEntry key={`admin:${accountKey}:${session.assuranceLevel}`} />
        </div>
        <section className={`${styles.card} ${styles.session}`} aria-labelledby="account-session-title">
          <h2 id="account-session-title"><MimoIcon name="heart" />Seu acesso</h2>
          <StatusBadge tone="success" text="Você está na sua conta" />
          <p>Para encerrar o acesso neste navegador, saia da sua conta.</p>
          <Button variant="secondary" disabled={busy} onClick={onLogout}>Sair da conta</Button>
        </section>
      </div>
    </div>
  </div>;
}
