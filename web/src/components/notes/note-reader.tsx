'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { NoteVersion, ParticipantNoteCurrent } from '@/contracts/notes';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { storeError, storeRequest } from '@/components/stores/store-api';
import { useRewardAccess } from '@/components/rewards/access';
import { invalidateRelationship } from '@/components/notifications/relationship-refresh';
import styles from '@/components/notifications/relationship.module.css';

function RenderedNote({ note }: { note: NoteVersion }) {
  const unavailable = useRewardAccess(); const [error, setError] = useState(''); const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    // Este efeito ocorre após o commit do texto exato; a consulta do cartão ou
    // o clique na novidade, por si, nunca registra leitura.
    storeRequest(`/api/lojas/${note.storeId}/bilhetes/versoes/${note.id}/lida`, 'POST', {}, controller.signal)
      .then(() => { if (!controller.signal.aborted) { setError(''); invalidateRelationship(); } })
      .catch(cause => { if (!controller.signal.aborted) { unavailable(cause); setError(storeError(cause)); } });
    return () => controller.abort();
  }, [note.storeId, note.id, revision, unavailable]);
  return <><p className={styles.muted}>De {note.author.displayName || 'quem cuida da sua lojinha'} · versão {note.version} · <time dateTime={note.createdAt}>{new Date(note.createdAt).toLocaleString('pt-BR')}</time></p>
    <p className={styles.text}>{note.text}</p>{error && <div role="alert"><p>{error}</p><Button variant="secondary" onClick={() => setRevision(value => value + 1)}>Confirmar leitura desta versão</Button></div>}</>;
}

export function NoteReader({ storeId, note, requestedVersion, requestedOpen = false }: { storeId: string; note: ParticipantNoteCurrent; requestedVersion?: string; requestedOpen?: boolean }) {
  const trigger = useRef<HTMLButtonElement>(null); const unavailable = useRewardAccess();
  const returnFocus = useRef<HTMLElement | null>(null);
  const [displayed, setDisplayed] = useState<NoteVersion | null>(requestedOpen && !requestedVersion ? note.current : null); const [open, setOpen] = useState(requestedOpen && !!note.current && !requestedVersion);
  const [error, setError] = useState(''); const [loading, setLoading] = useState(false); const [retry, setRetry] = useState(0);
  const active = useRef<AbortController | null>(null);
  const [previousOpenRequest, setPreviousOpenRequest] = useState(requestedOpen);
  if (requestedOpen !== previousOpenRequest) {
    setPreviousOpenRequest(requestedOpen);
    if (requestedOpen && note.current) { setDisplayed(note.current); setOpen(true); }
  }
  useLayoutEffect(() => {
    if (!open || !requestedOpen) return;
    const origin = document.activeElement;
    returnFocus.current = origin instanceof HTMLElement && origin !== document.body ? origin : trigger.current;
  }, [open, requestedOpen]);
  useEffect(() => () => { active.current?.abort(); }, []);
  useEffect(() => {
    if (!requestedVersion) return;
    const controller = new AbortController(); active.current = controller;
    storeRequest<NoteVersion>(`/api/lojas/${storeId}/bilhetes/versoes/${encodeURIComponent(requestedVersion)}`, 'GET', undefined, controller.signal)
      .then(value => { if (!controller.signal.aborted) { returnFocus.current = trigger.current; setDisplayed(value); setOpen(true); setError(''); } })
      .catch(cause => { if (!controller.signal.aborted) { unavailable(cause); setError(storeError(cause)); setDisplayed(null); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => { controller.abort(); if (active.current === controller) active.current = null; };
  }, [requestedVersion, storeId, unavailable, retry]);
  const newer = displayed && note.current && displayed.id !== note.current.id && note.current.version > displayed.version;
  function changeOpen(value: boolean) {
    setOpen(value);
    if (!value) {
      const url = new URL(window.location.href); url.searchParams.delete('abrirBilhete'); url.searchParams.delete('bilhete');
      window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
    }
  }
  return <section className={styles.card} aria-label="Bilhete da sua relação">
    <h2>Um bilhete para você</h2><p>Um carinho privado de quem oferece os mimos.</p>
    {note.unread && <span className={styles.badge}>Bilhete não lido</span>}
    {loading && <p role="status">Abrindo o bilhete…</p>}
    {error && <div role="alert"><p>{error}</p>{requestedVersion && <Button variant="secondary" onClick={() => { setLoading(true); setRetry(value => value + 1); }}>Consultar esta versão novamente</Button>}</div>}
    {note.current ? <Button ref={trigger} variant="secondary" onClick={() => { returnFocus.current = trigger.current; setDisplayed(note.current); setOpen(true); }}>♡ Abrir bilhete</Button> : <p>Quando chegar um bilhete, ele aparece aqui.</p>}
    <Dialog open={open} onOpenChange={changeOpen} title="Seu bilhete" returnFocusRef={returnFocus}>
      {displayed && <RenderedNote key={displayed.id} note={displayed} />}
      {newer && <div role="status"><p>Há um bilhete novo. A versão aberta foi mantida.</p><Button onClick={() => setDisplayed(note.current)}>Abrir o bilhete novo</Button></div>}
      <Button variant="secondary" onClick={() => changeOpen(false)}>Guardar esse carinho</Button>
    </Dialog>
  </section>;
}
