'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export type StoreFields = { name: string; presentation: string; timezone: string };
export function StoreForm({ initial, busy, locked = false, submitLabel, onSave }: {
  initial?: StoreFields; busy: boolean; locked?: boolean; submitLabel: string;
  onSave: (fields: StoreFields) => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [presentation, setPresentation] = useState(initial?.presentation ?? '');
  const [timezone, setTimezone] = useState(initial?.timezone ?? 'America/Sao_Paulo');
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); onSave({ name: name.trim(), presentation: presentation.trim(), timezone: timezone.trim() });
  }
  return <form className="stores-form" onSubmit={submit}>
    <Input label="Nome da loja" name="name" value={name} maxLength={80} required onChange={event => setName(event.target.value)} disabled={busy} readOnly={locked} />
    <label className="stores-field">Apresentação<textarea className="ui-input" name="presentation" value={presentation} maxLength={280} rows={4}
      onChange={event => setPresentation(event.target.value)} disabled={busy} readOnly={locked} /></label>
    <Input label="Fuso horário" name="timezone" value={timezone} maxLength={100} required disabled={busy} readOnly={locked}
      onChange={event => setTimezone(event.target.value)} hint="Use um fuso como America/Sao_Paulo ou Europe/Lisbon. Ele orienta as datas desta loja." />
    <p className="stores-muted">Sua lojinha começa com a identidade do Meu Mimo, pronta para usar.</p>
    {locked && <p>Estamos consultando a mesma solicitação. Os dados ficam preservados até confirmar o resultado.</p>}
    <Button type="submit" disabled={busy}>{busy ? 'Só um instante…' : submitLabel}</Button>
  </form>;
}
