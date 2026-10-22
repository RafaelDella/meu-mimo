'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { ActivityFields, ActivityView } from '@/contracts/activities';
import type { StoreView } from '@/contracts/stores';
import { Button } from '@/components/ui/button';
import { StoreRequestError, storeError, useResource } from '@/components/stores/store-api';
import { ActivityForm } from './activity-form';
import { Rule } from './activity-display';
import { activityApi, activityPath, base, privacyError } from './transport';

function Editor({ store, initial }: { store: StoreView; initial?: ActivityView }) {
  const router = useRouter();
  const active = useRef<AbortController | null>(null);
  const pending = useRef<(ActivityFields & { operationId: string; expectedVersion: number }) | null>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [uncertain, setUncertain] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [denied, setDenied] = useState(false);
  const [current, setCurrent] = useState(initial);
  useEffect(() => () => active.current?.abort(), []);
  async function save(fields: ActivityFields) {
    if (active.current || conflict) return;
    pending.current ??= { ...fields, operationId: crypto.randomUUID(), expectedVersion: current?.version ?? 1 };
    const body = pending.current;
    const controller = new AbortController(); active.current = controller;
    setBusy(true); setError('');
    try {
      const { expectedVersion, ...creation } = body;
      const result = current ? await activityApi.update(store.id, current.id, { ...creation, expectedVersion }, controller.signal) :
        await activityApi.create(store.id, creation, controller.signal);
      if (controller.signal.aborted) return;
      router.push(activityPath(store.id, result.activity.id));
    } catch (cause) {
      if (controller.signal.aborted) return;
      if (privacyError(cause)) setDenied(true);
      else if (cause instanceof StoreRequestError && cause.status === 409) { setConflict(true); pending.current = null; setUncertain(false); }
      else if (cause instanceof StoreRequestError && cause.status === 400 && !uncertain) { pending.current = null; setUncertain(false); }
      else setUncertain(true);
      setError(storeError(cause)); title.current?.focus();
    } finally { if (!controller.signal.aborted) { active.current = null; setBusy(false); } }
  }
  async function refresh() {
    if (!current || active.current) return;
    const controller = new AbortController(); active.current = controller; setBusy(true);
    try { const next = await activityApi.get(store.id, current.id, controller.signal);
      if (!controller.signal.aborted) { setCurrent(next); setConflict(false); setError(''); title.current?.focus(); }
    } catch (cause) { if (!controller.signal.aborted) { setError(storeError(cause)); if (privacyError(cause)) setDenied(true); } }
    finally { if (!controller.signal.aborted) { active.current = null; setBusy(false); } }
  }
  if (denied) return <section className="stores-card"><h2>Acesso indisponível</h2><p role="alert">Este conteúdo não está disponível para sua conta.</p></section>;
  return <section className="stores-card"><Link className="stores-link" href={activityPath(store.id, current?.id)}>Voltar às atividades</Link>
    <h2 ref={title} tabIndex={-1}>{current ? 'Editar atividade' : 'Nova atividade'}</h2>
    <p role="alert" className="stores-error">{error}</p>
    {conflict && <div className="stores-banner"><p>A atividade mudou desde que você abriu o formulário. Você pode copiar os campos abaixo antes de carregar a versão atual; o carregamento substitui os campos.</p>
      <Button variant="secondary" disabled={busy} onClick={() => { void refresh(); }}>Carregar versão atual</Button></div>}
    {uncertain && <p role="status">O resultado ainda não foi confirmado. Consulte o mesmo salvamento para evitar duplicação.</p>}
    {current?.archivedAt ? <><p>Esta atividade foi arquivada e está somente para consulta.</p><Rule activity={current} /></> :
      <ActivityForm key={current ? `${current.id}:${current.version}` : 'new'} initial={current} busy={busy} locked={uncertain || conflict} canSubmit={!conflict}
        submitLabel={uncertain ? 'Consultar salvamento' : 'Salvar atividade'} onSave={fields => { void save(fields); }} />}
  </section>;
}
function LoadEditor({ store, activityId }: { store: StoreView; activityId: string }) {
  const { data, error, loading, reload } = useResource<ActivityView>(`${base(store.id)}/atividades/${encodeURIComponent(activityId)}`);
  if (loading) return <p role="status">Abrindo atividade…</p>;
  if (error || !data) return <section className="stores-card"><h2>Atividade indisponível</h2><p role="alert">{storeError(error)}</p><Button variant="secondary" onClick={reload}>Tentar carregar novamente</Button></section>;
  return <Editor store={store} initial={data} />;
}
export function ActivityEditor({ store, activityId }: { store: StoreView; activityId?: string }) {
  if (store.role !== 'MERCHANT') return <section className="stores-card"><h2>Acesso indisponível</h2><p>Esta área é reservada a quem gerencia a loja.</p></section>;
  if (store.state === 'CLOSED') return <section className="stores-card"><h2>Loja encerrada</h2><p>Os cadastros e as conquistas anteriores continuam disponíveis para consulta.</p></section>;
  return activityId ? <LoadEditor store={store} activityId={activityId} /> : <Editor store={store} />;
}
