'use client';

import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';

export function Feedback({ error, message, busy }: { error?: string; message?: string; busy?: boolean }) {
  return <><p className="stores-feedback" role="status" aria-live="polite" aria-atomic="true">{busy ? 'Só um instante…' : message}</p>
    <p className="stores-error" role="alert" aria-atomic="true">{error}</p></>;
}

export function Pagination({ page, pageSize, total, onPage, busy = false }: {
  page: number; pageSize: number; total: number; onPage: (page: number) => void; busy?: boolean;
}) {
  return <nav className="stores-pagination" aria-label="Páginas da lista">
    <Button variant="secondary" disabled={busy || page <= 1} onClick={() => onPage(page - 1)}>Anterior</Button>
    <span aria-live="polite">Página {page} de {Math.max(1, Math.ceil(total / pageSize))}</span>
    <Button variant="secondary" disabled={busy || page * pageSize >= total} onClick={() => onPage(page + 1)}>Próxima</Button>
  </nav>;
}

export function ConfirmAction({ label, title, description, confirmLabel, busy, onConfirm, children, error, confirmDisabled = false }: {
  label: string; title: string; description: string; confirmLabel: string; busy: boolean;
  onConfirm: (close: () => void) => void; children?: ReactNode; error?: string; confirmDisabled?: boolean;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  return <>
    <Button ref={trigger} variant="secondary" disabled={busy} onClick={() => setOpen(true)}>{label}</Button>
    <Dialog open={open} onOpenChange={next => { if (!busy) setOpen(next); }} title={title}
      description={description} returnFocusRef={trigger}>
      {children}
      <Feedback error={error} busy={busy} />
      <div className="stores-actions"><Button disabled={busy || confirmDisabled} onClick={() => onConfirm(() => setOpen(false))}>{busy ? 'Confirmando…' : confirmLabel}</Button>
        <Button variant="secondary" disabled={busy} onClick={() => setOpen(false)}>Voltar</Button></div>
    </Dialog>
  </>;
}
