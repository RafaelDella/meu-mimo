'use client';

import Link from 'next/link';
import type { NotificationGroupPage } from '@/contracts/notifications';
import { useRelationshipResource } from './use-relationship-resource';

export function NotificationBell() {
  const resource = useRelationshipResource<NotificationGroupPage>('/api/notificacoes/grupos?page=1&pageSize=1');
  return <span><Link href="/notificacoes">Novidades{resource.data ? ` · ${resource.data.attentionUnreadCount}` : ''}</Link>
    {resource.error && !resource.denied ? <span role="status"> · contador indisponível</span> : null}</span>;
}
