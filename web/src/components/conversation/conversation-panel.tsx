'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { CommentPage } from '@/contracts/conversations';
import { Button } from '@/components/ui/button';
import { StoreRequestError, storeError } from '@/components/stores/store-api';
import { conversationTransport } from './transport';
import type { CommentOperation, ConversationContext, ConversationTransport } from './transport';
import styles from './conversation.module.css';
import { ReactionPicker } from '@/components/reactions/reaction-picker';
import { invalidateRelationship, useRelationshipRefresh } from '@/components/notifications/relationship-refresh';
import { accessDenied, useRewardAccess } from '@/components/rewards/access';

type Props = ConversationContext & { accountKey: string; transport?: ConversationTransport; includeReactions?: boolean };

// O chamador monta esta área somente após validar a sessão e o recurso atual.
// A chave explícita impede preservar rascunhos ou respostas entre contas/assuntos.
export function ConversationPanel({ accountKey, storeId, conversationId, transport = conversationTransport, includeReactions = true }: Props) {
  return <ConversationContent key={`${accountKey}:${storeId}:${conversationId}`} storeId={storeId}
    conversationId={conversationId} transport={transport} includeReactions={includeReactions} />;
}

function ConversationContent({ storeId, conversationId, transport, includeReactions }: ConversationContext & { transport: ConversationTransport; includeReactions: boolean }) {
  const fieldId = useId();
  const title = useRef<HTMLHeadingElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const active = useRef<AbortController | null>(null);
  const reading = useRef<AbortController | null>(null);
  const queued = useRef(false);
  const coordinator = useRelationshipRefresh();
  const unavailable = useRewardAccess();
  const pending = useRef<CommentOperation | null>(null);
  const focusAfterLoad = useRef(false);
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{ key: string; data?: CommentPage; error?: unknown }>();
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [synchronizing, setSynchronizing] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [closedByServer, setClosedByServer] = useState(false);
  const key = `${page}:${revision}`;
  const current = result?.key === key ? result : undefined;
  const count = Array.from(draft.trim()).length;
  const data = current?.data;
  const writable = !!data?.conversation.writable && !closedByServer;
  const invalid = count > 500;
  const load = useCallback(async function load() {
    if (reading.current) { queued.current = true; return; }
    const controller = new AbortController();
    reading.current = controller;
    try {
      const value = await transport.list({ storeId, conversationId }, page, controller.signal);
      if (!controller.signal.aborted) { setClosedByServer(false); setResult({ key, data: value }); }
    } catch (cause) {
      if (!controller.signal.aborted) {
        unavailable(cause);
        setResult(previous => !accessDenied(cause) && previous?.key === key
          ? { key, data: previous.data, error: cause } : { key, error: cause });
      }
    } finally {
      if (reading.current === controller) {
        reading.current = null;
        if (!controller.signal.aborted && queued.current) { queued.current = false; void load(); }
      }
    }
  }, [storeId, conversationId, page, key, transport, unavailable]);
  useEffect(() => {
    let mounted = true;
    // O ciclo descartado pelo StrictMode cancela antes de iniciar a consulta.
    void Promise.resolve().then(() => { if (mounted) void load(); });
    const path = `/api/lojas/${storeId}/conversas/${conversationId}/comentarios?page=${page}&pageSize=20`;
    const unsubscribe = coordinator?.subscribe(path, load);
    return () => { mounted = false; unsubscribe?.(); const controller = reading.current; reading.current = null; queued.current = false; controller?.abort(); };
  }, [coordinator, storeId, conversationId, page, load]);
  useEffect(() => () => active.current?.abort(), []);
  useEffect(() => {
    if (!current || !focusAfterLoad.current) return;
    focusAfterLoad.current = false;
    title.current?.focus();
  }, [current]);

  function reload() { focusAfterLoad.current = true; setRevision(value => value + 1); }
  function selectPage(next: number) { focusAfterLoad.current = true; setPage(next); }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (active.current) return;
    if (!pending.current && (!count || invalid)) {
      setError(!count ? 'Escreva um comentário para enviar.' : 'Use até 500 caracteres no comentário.');
      input.current?.focus();
      return;
    }
    pending.current ??= { operationId: crypto.randomUUID(), text: draft.trim() };
    const body = pending.current;
    const controller = new AbortController();
    active.current = controller;
    setBusy(true); setError(''); setMessage('');
    void transport.send({ storeId, conversationId }, body, controller.signal).then(async () => {
      if (controller.signal.aborted) return;
      pending.current = null; setUncertain(false); setDraft(''); setMessage('Comentário enviado.');
      invalidateRelationship();
      title.current?.focus();
      setSynchronizing(true);
      // O POST já confirmou o comentário. Falha na consulta é tratada como
      // carregamento de dados, sem tornar a operação de escrita incerta novamente.
      try {
        const confirmed = await transport.list({ storeId, conversationId }, 1, controller.signal);
        if (controller.signal.aborted) return;
        setPage(Math.max(1, Math.ceil(confirmed.total / confirmed.pageSize)));
        focusAfterLoad.current = true;
        setRevision(value => value + 1);
      } catch (cause) {
        if (!controller.signal.aborted) { unavailable(cause); setResult({ key, error: cause }); }
      }
    }).catch(cause => {
      if (controller.signal.aborted) return;
      unavailable(cause);
      if (cause instanceof StoreRequestError && cause.code === 'conversation_read_only') {
        pending.current = null; setUncertain(false); setClosedByServer(true);
        title.current?.focus();
      } else if (!uncertain && cause instanceof StoreRequestError && cause.status === 400) pending.current = null;
      else setUncertain(true);
      setError(storeError(cause));
    }).finally(() => {
      if (!controller.signal.aborted) { active.current = null; setBusy(false); setSynchronizing(false); }
    });
  }

  return <section className={styles.panel} aria-labelledby={`${fieldId}-title`}>
    <h2 id={`${fieldId}-title`} ref={title} tabIndex={-1}>Conversa deste item</h2>
    <p>Esta conversa fica entre você e a outra pessoa desta relação.</p>
    <p role="status" aria-live="polite" aria-atomic="true">{synchronizing ? 'Comentário enviado. Atualizando a conversa…' : busy ? 'Enviando comentário…' : message}</p>
    <p role="alert" className={styles.error} aria-atomic="true">{error}</p>
    {!current && <p role="status">Buscando a conversa…</p>}
    {current?.error ? <div role="alert"><p>{storeError(current.error)}</p>
      <Button variant="secondary" onClick={reload}>Tentar carregar novamente</Button></div> : null}
    {data && <>
      {includeReactions && <ReactionPicker key={conversationId} storeId={storeId} conversationId={conversationId} />}
      {!data.items.length && <p>Ainda não há comentários neste item.</p>}
      <ol className={styles.comments} aria-label="Comentários do item">{data.items.map(comment => <li key={comment.id}>
        <p className={styles.author}>{comment.author.displayName || 'Pessoa da relação'} · <time dateTime={comment.createdAt}>
          {new Date(comment.createdAt).toLocaleString('pt-BR')}</time></p><p className={styles.text}>{comment.text}</p>
      </li>)}</ol>
      <nav className={styles.actions} aria-label="Páginas de comentários">
        <Button variant="secondary" disabled={page <= 1 || busy} onClick={() => selectPage(page - 1)}>Anteriores</Button>
        <span>Página {page} de {Math.max(1, Math.ceil(data.total / data.pageSize))}</span>
        <Button variant="secondary" disabled={page * data.pageSize >= data.total || busy} onClick={() => selectPage(page + 1)}>Próximos</Button>
      </nav>
      {writable || uncertain || draft.length > 0 ? <form className={styles.form} onSubmit={submit} aria-busy={busy}>
        <label htmlFor={fieldId}>Seu comentário</label>
        <textarea id={fieldId} ref={input} value={draft} readOnly={busy || uncertain || !writable} aria-invalid={invalid || undefined}
          aria-describedby={`${fieldId}-hint`} onChange={event => setDraft(event.target.value)} rows={4} />
        <p id={`${fieldId}-hint`} className={invalid ? styles.error : undefined}>{count} de 500 caracteres. Use texto simples.</p>
        {uncertain && <p>O resultado ainda não foi confirmado. Consulte o mesmo envio para evitar duplicação.</p>}
        {(writable || uncertain) && <Button type="submit" disabled={busy}>{synchronizing ? 'Atualizando…' : busy ? 'Enviando…' : uncertain ? 'Consultar envio' : 'Enviar comentário'}</Button>}
      </form> : null}
      {!writable && <p>Esta conversa está somente para consulta.{draft.length > 0 ? ' Você pode selecionar e copiar seu rascunho acima.' : ''}</p>}
      <Button variant="secondary" disabled={busy} onClick={reload}>Atualizar conversa</Button>
    </>}
  </section>;
}
