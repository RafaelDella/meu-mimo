'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { FeedItem } from '@/contracts/feed';
import { ConversationPanel } from '@/components/conversation/conversation-panel';
import { AlbumThumbnail } from '@/components/albums/album-preview';
import { ReactionPicker } from '@/components/reactions/reaction-picker';
import { Button } from '@/components/ui/button';
import styles from '@/components/notifications/relationship.module.css';

const statuses: Record<FeedItem['status'], string> = { PENDING: 'Em análise', APPROVED: 'Aprovada', CONTESTED: 'Contestada', VOIDED: 'Anulada', WAITING_AGREEMENT: 'A combinar', AGREED: 'Combinado', CANCELLATION_REQUESTED: 'Cancelamento solicitado', FULFILLED: 'Realizado', CANCELLED: 'Cancelado' };
export function FeedCard({ item, accountKey, merchant, returnTo }: { item: FeedItem; accountKey: string; merchant: boolean; returnTo?: string }) {
  const [conversation, setConversation] = useState(false);
  const path = returnTo ? `${item.path}${item.path.includes('?') ? '&' : '?'}voltar=${encodeURIComponent(returnTo)}` : item.path;
  return <article className={styles.card}><p className={styles.muted}>{item.subjectType === 'TICKET' ? 'Mimo resgatado' : 'Conquista recebida'} · <time dateTime={item.occurredAt}>{new Date(item.occurredAt).toLocaleString('pt-BR')}</time></p>
    <h3><Link href={path}>{item.name}</Link></h3>{merchant && <p>{item.participant.displayName || 'Pessoa participante'}</p>}
    <p className={styles.badge}>{statuses[item.status]}</p><p className={styles.text}>{item.summary}</p>
    {item.preview && <AlbumThumbnail key={item.preview.assetId} storeId={item.storeId} assetId={item.preview.assetId} />}
    {item.publishedMediaCount > 0 && <p>{item.publishedMediaCount} {item.publishedMediaCount === 1 ? 'momento publicado' : 'momentos publicados'}.</p>}
    <div className={styles.actions}><Link className="stores-link" href={path}>Abrir {item.subjectType === 'TICKET' ? 'ticket' : 'conquista'}</Link>
      <Button variant="secondary" aria-expanded={conversation} onClick={() => setConversation(value => !value)}>{conversation ? 'Recolher conversa' : 'Abrir conversa deste item'}</Button></div>
    {conversation ? <ConversationPanel accountKey={accountKey} storeId={item.storeId} conversationId={item.conversationId} /> : <ReactionPicker storeId={item.storeId} conversationId={item.conversationId} initialState={item.reactions} />}
  </article>;
}
