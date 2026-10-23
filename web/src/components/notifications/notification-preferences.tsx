'use client';

import { useState } from 'react';
import type { NotificationPreferences as Preferences, PreferencesBody, PreferencesMutation } from '@/contracts/notifications';
import { Button } from '@/components/ui/button';
import { storeError } from '@/components/stores/store-api';
import { RewardAccess } from '@/components/rewards/access';
import { useRelationshipResource } from './use-relationship-resource';
import { useRelationshipIntent } from './use-relationship-intent';
import { RelationshipRefresh } from './relationship-refresh';
import styles from './relationship.module.css';
import { StoreSelector } from './store-selector';

export function NotificationPreferences({ storeId }: { storeId: string }) {
  const path = `/api/lojas/${storeId}/preferencias/notificacoes`; const resource = useRelationshipResource<Preferences>(path);
  const [edited, setEdited] = useState<Preferences>(); const [applied, setApplied] = useState<Preferences>();
  const current = applied && (!resource.data || applied.version > resource.data.version) ? applied : resource.data;
  const draft = edited ?? current;
  const intent = useRelationshipIntent<PreferencesBody, PreferencesMutation>({ path, method: 'PATCH', queryKey: `avisos-${storeId}`,
    onConfirmed: value => { setApplied(value.preferences); setEdited(undefined); void resource.reload(); },
    onConflict: () => { setEdited(undefined); void resource.reload(); } });
  return <section className={styles.card} aria-label="Preferências de novidades da loja">
    <h3>Novidades desta loja</h3><p>As preferências afetam o contador de atenção. O histórico e as decisões continuam disponíveis.</p>
    {resource.loading && <p role="status">Consultando preferências…</p>}
    {resource.error && !resource.denied ? <div role="alert"><p>{storeError(resource.error)}</p><Button variant="secondary" onClick={resource.reload}>Consultar preferências novamente</Button></div> : null}
    {draft && !resource.error && <form className={styles.stack} onSubmit={event => {
      event.preventDefault(); void (intent.uncertain ? intent.retry() : intent.send({ operationId: crypto.randomUUID(), expectedVersion: draft.version, socialMuted: draft.socialMuted, automaticApprovalNotices: draft.automaticApprovalNotices }));
    }}>
      <label><input type="checkbox" checked={draft.socialMuted} disabled={intent.busy || intent.uncertain} onChange={event => setEdited({ ...draft, socialMuted: event.target.checked })} /> Silenciar interações desta loja</label>
      <label><input type="checkbox" checked={draft.automaticApprovalNotices} disabled={intent.busy || intent.uncertain} onChange={event => setEdited({ ...draft, automaticApprovalNotices: event.target.checked })} /> Avisar aprovações automáticas</label>
      <Button type="submit" disabled={intent.busy}>{intent.busy ? 'Conferindo preferências…' : intent.uncertain ? 'Consultar alteração das preferências' : 'Salvar preferências'}</Button>
    </form>}
    <p role="alert">{intent.error}</p><p role="status">{intent.message}</p>
    {intent.uncertain && <p>A alteração ainda não foi confirmada. Consulte antes de mudar as opções.</p>}
  </section>;
}

function StorePreferencesList({ accountKey }: { accountKey: string }) {
  const [selected, setSelected] = useState('');
  return <section className={styles.stack}><h2>Preferências de novidades</h2>
    <StoreSelector label="Loja das preferências" emptyLabel="Selecione uma loja" value={selected} onChange={setSelected} />
    {selected && <RelationshipRefresh key={`${accountKey}:${selected}`} accountKey={accountKey} storeId={selected}><NotificationPreferences storeId={selected} /></RelationshipRefresh>}
  </section>;
}
export function NotificationSettingsSection({ accountKey }: { accountKey: string }) {
  return <RewardAccess key={accountKey}><RelationshipRefresh accountKey={accountKey}><StorePreferencesList accountKey={accountKey} /></RelationshipRefresh></RewardAccess>;
}
