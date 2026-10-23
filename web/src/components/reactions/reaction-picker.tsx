'use client';

import { useId, useState } from 'react';
import type { ReactionBody, ReactionEmoji, ReactionMutation, ReactionState } from '@/contracts/reactions';
import { Button } from '@/components/ui/button';
import { storeError } from '@/components/stores/store-api';
import { useRelationshipIntent } from '@/components/notifications/use-relationship-intent';
import { useRelationshipResource } from '@/components/notifications/use-relationship-resource';
import styles from '@/components/notifications/relationship.module.css';
import { invalidateRelationship } from '@/components/notifications/relationship-refresh';

const choices: { emoji: ReactionEmoji; label: string }[] = [
  { emoji: '❤️', label: 'Coração' }, { emoji: '👏', label: 'Palmas' }, { emoji: '🥹', label: 'Emoção' },
  { emoji: '🔥', label: 'Fogo' }, { emoji: '😂', label: 'Risada' }, { emoji: '🌷', label: 'Tulipa' },
];
export function ReactionPicker({ storeId, conversationId, initialState }: { storeId: string; conversationId: string; initialState?: ReactionState }) {
  const id = useId(); const path = `/api/lojas/${storeId}/conversas/${conversationId}/reacao`;
  const resource = useRelationshipResource<ReactionState>(path, !initialState);
  const [applied, setApplied] = useState<ReactionState>();
  const projection = initialState ?? resource.data;
  const confirmed = applied && (!projection || applied.version > projection.version) ? applied : projection;
  const intent = useRelationshipIntent<ReactionBody, ReactionMutation>({ path, method: 'PUT', queryKey: `reacao-${conversationId}`,
    onConfirmed: value => { setApplied(value.state); if (!initialState) void resource.reload(); },
    onConflict: () => { if (initialState) invalidateRelationship(); else void resource.reload(); } });
  function choose(emoji: ReactionEmoji | null) {
    if (!confirmed || !confirmed.writable) return;
    void intent.send({ operationId: crypto.randomUUID(), expectedVersion: confirmed.version, emoji });
  }
  if (resource.denied) return null;
  return <section aria-labelledby={`${id}-title`} className={styles.stack}>
    <h3 id={`${id}-title`}>Reações deste item</h3>
    {resource.loading && <p role="status">Consultando reações…</p>}
    {resource.error ? <div role="alert"><p>{storeError(resource.error)}</p><Button variant="secondary" onClick={resource.reload}>Consultar reações novamente</Button></div> : null}
    {confirmed && !resource.error && <>
      <ul className={styles.list} aria-label="Reações da relação">{confirmed.reactions.map(value => <li key={value.author.id}>{value.emoji} · {value.author.displayName || 'Pessoa da relação'}</li>)}</ul>
      {!confirmed.reactions.length && <p>Ainda não há reações neste item.</p>}
      <div className={styles.reactions} role="group" aria-label="Escolher sua reação">{choices.map(({ emoji, label }) => <button key={emoji} type="button" className={`${styles.reaction} ${styles.card}`}
        aria-label={`Reagir com ${label.toLowerCase()}`} aria-pressed={confirmed.mine === emoji} disabled={!confirmed.writable || intent.busy || intent.uncertain} onClick={() => choose(emoji)}>{emoji}</button>)}</div>
      {confirmed.mine && <Button variant="secondary" disabled={!confirmed.writable || intent.busy || intent.uncertain} onClick={() => choose(null)}>Remover minha reação</Button>}
      {!confirmed.writable && <p>Esta conversa permite somente consultar as reações.</p>}
    </>}
    <p role="alert">{intent.error}</p><p role="status">{intent.busy ? 'Conferindo sua reação…' : intent.message}</p>
    {intent.uncertain && <><p>O resultado está pendente de confirmação. Sua escolha foi preservada.</p><Button variant="secondary" disabled={intent.busy} onClick={() => void intent.retry()}>Consultar minha reação</Button></>}
  </section>;
}
