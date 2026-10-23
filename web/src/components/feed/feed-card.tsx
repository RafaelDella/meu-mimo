'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { FeedItem } from '@/contracts/feed';
import { ConversationPanel } from '@/components/conversation/conversation-panel';
import { AlbumThumbnail } from '@/components/albums/album-preview';
import { ReactionPicker } from '@/components/reactions/reaction-picker';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/status-badge';
import styles from '@/components/notifications/relationship.module.css';
import feedStyles from './feed.module.css';

const statuses: Record<FeedItem['status'], string> = { PENDING: 'Em análise', APPROVED: 'Aprovada', CONTESTED: 'Contestada', VOIDED: 'Anulada', WAITING_AGREEMENT: 'A combinar', AGREED: 'Combinado', CANCELLATION_REQUESTED: 'Cancelamento solicitado', FULFILLED: 'Realizado', CANCELLED: 'Cancelado' };
export function FeedCard({ item, accountKey, merchant, returnTo }: { item: FeedItem; accountKey: string; merchant: boolean; returnTo?: string }) {
  const [conversation, setConversation] = useState(false);
  const path = returnTo ? `${item.path}${item.path.includes('?') ? '&' : '?'}voltar=${encodeURIComponent(returnTo)}` : item.path;
  const tone = item.status === 'APPROVED' || item.status === 'FULFILLED' ? 'success' : item.status === 'PENDING' || item.status === 'WAITING_AGREEMENT' || item.status === 'CANCELLATION_REQUESTED' ? 'pending' : item.status === 'VOIDED' ? 'error' : 'info';
  return <article className={`${styles.card} ${feedStyles.card}`}><p className={`${styles.muted} ${feedStyles.metadata}`}>{item.subjectType === 'TICKET' ? 'Mimo resgatado' : 'Conquista recebida'} · <time dateTime={item.occurredAt}>{new Date(item.occurredAt).toLocaleString('pt-BR')}</time></p>
    <h3><Link href={path}>{item.name}</Link></h3><div className={feedStyles.statusLine}><StatusBadge tone={tone} text={statuses[item.status]} />{merchant && <p>{item.participant.displayName || 'Pessoa participante'}</p>}</div>
    <div className={styles.actions}><Link className="stores-link" href={path}>Abrir {item.subjectType === 'TICKET' ? 'ticket' : 'conquista'}</Link>
      <Button variant="secondary" aria-expanded={conversation} onClick={() => setConversation(value => !value)}>{conversation ? 'Recolher conversa' : 'Abrir conversa deste item'}</Button></div>
    <p className={styles.text}>{item.summary}</p>
    {item.preview && <AlbumThumbnail key={item.preview.assetId} storeId={item.storeId} assetId={item.preview.assetId} />}
    {item.publishedMediaCount > 0 && <p>{item.publishedMediaCount} {item.publishedMediaCount === 1 ? 'momento publicado' : 'momentos publicados'}.</p>}
    {conversation ? <ConversationPanel accountKey={accountKey} storeId={item.storeId} conversationId={item.conversationId} /> : <ReactionPicker storeId={item.storeId} conversationId={item.conversationId} initialState={item.reactions} />}
  </article>;
}
