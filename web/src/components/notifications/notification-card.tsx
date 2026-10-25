'use client';

import { useRef } from 'react';
import type { NotificationGroupView, NotificationCategory } from '@/contracts/notifications';
import { Button } from '@/components/ui/button';
import { MimoIcon } from '@/components/ui/mimo-icon';
import type { MimoIconName } from '@/components/ui/mimo-icon';
import { StatusBadge } from '@/components/ui/status-badge';
import { categoryLabels, notificationLabels } from './notification-labels';
import styles from './notification-center.module.css';

const categoryIcons: Record<NotificationCategory, MimoIconName> = { NOTES: 'mail', ACTIVITIES: 'activities', REWARDS: 'gift', SOCIAL: 'heart' };

export function NotificationCard({ group, onRead, onOpen, busy }: {
  group: NotificationGroupView; onRead(heading: HTMLHeadingElement | null, trigger: HTMLButtonElement): void;
  onOpen(trigger: HTMLButtonElement): void; busy: boolean;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  return <article className={styles.card} data-unread={group.unreadCount > 0}>
    <div className={styles.cardHeader}><div className={styles.category}><MimoIcon name={categoryIcons[group.category]} /><span>{categoryLabels[group.category]}</span></div>
      <time dateTime={group.lastOccurredAt}>{new Date(group.lastOccurredAt).toLocaleString('pt-BR')}</time></div>
    <h3 ref={heading} tabIndex={-1}>{group.storeName || 'Sua lojinha'}</h3>
    <p className={styles.event}><strong>{group.latest.actor.displayName || 'Pessoa da relação'}</strong> {notificationLabels[group.latest.kind]}.</p>
    {group.count > 1 && <p className={styles.muted}>{group.count} interações neste grupo.</p>}
    <div className={styles.readState}><StatusBadge tone={group.unreadCount ? group.attentionActive ? 'pending' : 'info' : 'success'}
      text={group.unreadCount ? `${group.unreadCount} ${group.unreadCount === 1 ? 'novidade não lida' : 'novidades não lidas'}` : 'Lido'} />
      {!group.attentionActive && <span className={styles.muted}>Sem aviso ativo no contador</span>}</div>
    <div className={styles.actions}><Button aria-disabled={busy} onClick={event => { if (!busy) onOpen(event.currentTarget); }}><MimoIcon name="arrow" />Abrir novidade</Button>
      {group.unreadCount > 0 && <Button variant="secondary" aria-disabled={busy} onClick={event => { if (!busy) onRead(heading.current, event.currentTarget); }}>Marcar grupo como lido</Button>}</div>
  </article>;
}
