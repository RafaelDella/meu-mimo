'use client';

import { useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { NoteBody, NoteCurrent, NoteMutation } from '@/contracts/notes';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { useRelationshipIntent } from '@/components/notifications/use-relationship-intent';
import styles from '@/components/notifications/relationship.module.css';

export function NoteEditor({ storeId, membershipId, note, reload }: { storeId: string; membershipId: string; note: NoteCurrent; reload(): void }) {
  const fieldId = useId(); const field = useRef<HTMLTextAreaElement>(null); const trigger = useRef<HTMLButtonElement>(null);
  const [draft, setDraft] = useState(note.current?.text ?? ''); const [preview, setPreview] = useState(false);
  const [baseVersion, setBaseVersion] = useState(note.current?.version ?? 0);
  const count = Array.from(draft.trim()).length;
  const intent = useRelationshipIntent<NoteBody, NoteMutation>({
    path: `/api/lojas/${storeId}/participacoes/${membershipId}/bilhete`, method: 'PATCH', queryKey: 'envioBilhete',
    onConfirmed: value => { setDraft(value.current.text); setBaseVersion(value.current.version); setPreview(false); reload(); }, onConflict: () => { setPreview(false); reload(); },
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (intent.uncertain) { void intent.retry(); return; }
    if (!count || count > 2000) { intent.setError(!count ? 'Escreva seu bilhete antes de continuar.' : 'Use até 2.000 caracteres no bilhete.'); field.current?.focus(); return; }
    setPreview(true);
  }
  return <section className={styles.card} aria-labelledby={`${fieldId}-title`}>
    <h2 id={`${fieldId}-title`}>Escrever bilhete</h2><p>Um carinho só para esta pessoa. Enviar uma nova versão preserva a anterior no histórico privado.</p>
    {note.current && <details><summary>Consultar bilhete atual · versão {note.current.version}</summary><p className={styles.text}>{note.current.text}</p></details>}
    {note.current && note.current.version > baseVersion && <div><p role="status">Seu rascunho usa a versão {baseVersion}. Há uma versão {note.current.version} para revisar antes de substituir o bilhete.</p>
      <Button variant="secondary" disabled={intent.busy || intent.uncertain} onClick={() => setBaseVersion(note.current!.version)}>Revisei a versão atual; usar como base</Button></div>}
    {!note.writable && <p>Esta relação está encerrada. O bilhete permanece disponível para consulta.</p>}
    <form onSubmit={submit} className={styles.stack} aria-busy={intent.busy}>
      <label className={styles.field} htmlFor={fieldId}>Texto do bilhete</label>
      <div className={styles.field}><textarea id={fieldId} ref={field} rows={8} value={draft} readOnly={!note.writable || intent.busy || intent.uncertain}
        aria-describedby={`${fieldId}-count`} aria-invalid={count > 2000 || undefined} onChange={event => setDraft(event.target.value)} /></div>
      <p id={`${fieldId}-count`} className={count > 2000 ? styles.error : styles.muted}>{count} de 2.000 caracteres Unicode.</p>
      <p role="alert" className={styles.error}>{intent.error}</p><p role="status">{intent.message}</p>
      {intent.uncertain && <p>O envio ainda não foi confirmado. Consulte o mesmo envio antes de editar ou reenviar.</p>}
      {(note.writable || intent.uncertain) && <Button ref={trigger} disabled={intent.busy} type="submit">{intent.busy ? 'Conferindo envio…' : intent.uncertain ? 'Consultar envio do bilhete' : 'Conferir bilhete'}</Button>}
    </form>
    <Dialog open={preview} onOpenChange={open => { if (!intent.busy) setPreview(open); }} title="Conferir seu bilhete" returnFocusRef={trigger}>
      <p className={styles.text}>{draft.trim()}</p><p>Esta versão será enviada somente à pessoa desta relação.</p>
      <p role="alert">{intent.error}</p><Button disabled={intent.busy} onClick={() => void (intent.uncertain ? intent.retry() : intent.send({ operationId: crypto.randomUUID(), expectedVersion: baseVersion, text: draft.trim() }))}>{intent.busy ? 'Enviando…' : intent.uncertain ? 'Consultar envio do bilhete' : 'Enviar bilhete'}</Button>
    </Dialog>
  </section>;
}
