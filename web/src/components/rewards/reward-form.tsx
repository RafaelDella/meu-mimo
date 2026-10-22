'use client';

import { useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { RewardFields, RewardSticker } from '@/contracts/rewards';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RewardPreview } from './reward-display';
import styles from './rewards.module.css';

export const emptyReward: RewardFields = { name: '', description: '', category: '', sticker: 'gift', cost: 10, note: '', instructions: '', available: true, stock: null };
export function RewardForm({ initial = emptyReward, busy, locked, canSubmit = true, submitLabel, onSave }: {
  initial?: RewardFields; busy: boolean; locked: boolean; canSubmit?: boolean; submitLabel: string; onSave: (value: RewardFields) => void;
}) {
  const id = useId();
  const nameField = useRef<HTMLInputElement>(null);
  const descriptionField = useRef<HTMLTextAreaElement>(null);
  const categoryField = useRef<HTMLInputElement>(null);
  const costField = useRef<HTMLInputElement>(null);
  const noteField = useRef<HTMLTextAreaElement>(null);
  const instructionsField = useRef<HTMLTextAreaElement>(null);
  const stockField = useRef<HTMLInputElement>(null);
  const [fields, setFields] = useState<RewardFields>({ ...initial });
  const [errors, setErrors] = useState<Partial<Record<keyof RewardFields, string>>>({});
  const [preview, setPreview] = useState(false);
  function set<K extends keyof RewardFields>(key: K, value: RewardFields[K]) {
    setFields(current => ({ ...current, [key]: value }));
    setErrors(current => ({ ...current, [key]: undefined }));
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = { ...fields, name: fields.name.trim(), description: fields.description.trim(), category: fields.category.trim(), note: fields.note.trim(), instructions: fields.instructions.trim() };
    const next: Partial<Record<keyof RewardFields, string>> = {};
    if (!normalized.name) next.name = 'Escreva um nome para o mimo.';
    else if (Array.from(normalized.name).length > 80) next.name = 'Use até 80 caracteres Unicode no nome do mimo.';
    if (Array.from(normalized.description).length > 1_000) next.description = 'Use até 1.000 caracteres Unicode na descrição.';
    if (Array.from(normalized.category).length > 80) next.category = 'Use até 80 caracteres Unicode na categoria.';
    if (!Number.isInteger(normalized.cost) || normalized.cost < 1 || normalized.cost > 1_000_000) next.cost = 'Use um número inteiro de 1 a 1.000.000 pontos.';
    if (Array.from(normalized.note).length > 500) next.note = 'Use até 500 caracteres Unicode no recadinho.';
    if (Array.from(normalized.instructions).length > 1_000) next.instructions = 'Use até 1.000 caracteres Unicode nas instruções.';
    if (normalized.stock !== null && (!Number.isInteger(normalized.stock) || normalized.stock < 0 || normalized.stock > 1_000_000)) next.stock = 'Use um número inteiro de 0 a 1.000.000 unidades.';
    setErrors(next);
    const targets = { name: nameField, description: descriptionField, category: categoryField, cost: costField, note: noteField, instructions: instructionsField, stock: stockField };
    const order = ['name', 'description', 'category', 'cost', 'note', 'instructions', 'stock'] as const;
    const first = order.find(key => next[key]);
    if (first) {
      targets[first].current?.focus(); return;
    }
    onSave(normalized);
  }
  return <form className={styles.form} onSubmit={submit} noValidate aria-busy={busy}>
    <Input ref={nameField} label="Nome do mimo" required value={fields.name} readOnly={locked} disabled={busy} hint="Até 80 caracteres Unicode." error={errors.name} onChange={event => set('name', event.target.value)} />
    <label className="stores-field" htmlFor={`${id}-description`}>Descrição<textarea ref={descriptionField} id={`${id}-description`} value={fields.description} readOnly={locked} disabled={busy} rows={4}
      aria-invalid={errors.description ? true : undefined} aria-describedby={`${id}-description-hint${errors.description ? ` ${id}-description-error` : ''}`} onChange={event => set('description', event.target.value)} /></label>
    <p id={`${id}-description-hint`}>Opcional, em texto simples. {Array.from(fields.description).length} de 1.000 caracteres Unicode.</p>
    <p id={`${id}-description-error`} role="alert" className="stores-error">{errors.description}</p>
    <Input ref={categoryField} label="Categoria" value={fields.category} list={`${id}-categories`} readOnly={locked} disabled={busy} hint="Até 80 caracteres Unicode. Você pode criar outra categoria." error={errors.category} onChange={event => set('category', event.target.value)} />
    <datalist id={`${id}-categories`}><option value="A dois" /><option value="Pra você" /><option value="Surpresas" /></datalist>
    <label className="stores-field">Ilustração<select className="ui-input" value={fields.sticker} disabled={busy || locked} onChange={event => set('sticker', event.target.value as RewardSticker)}>
      <option value="gift">Presente</option><option value="coffee">Café</option><option value="takeout">Comidinha</option><option value="envelope">Cartinha</option></select></label>
    <Input ref={costField} label="Custo em pontos" type="number" inputMode="numeric" min={1} max={1_000_000} step={1} required value={Number.isNaN(fields.cost) ? '' : fields.cost}
      readOnly={locked} disabled={busy} hint="Número inteiro entre 1 e 1.000.000 pontos." error={errors.cost} onChange={event => set('cost', event.target.valueAsNumber)} />
    <label className="stores-field" htmlFor={`${id}-note`}>Recadinho do catálogo<textarea ref={noteField} id={`${id}-note`} value={fields.note} readOnly={locked} disabled={busy} rows={3}
      aria-invalid={errors.note ? true : undefined} aria-describedby={`${id}-note-hint${errors.note ? ` ${id}-note-error` : ''}`} onChange={event => set('note', event.target.value)} /></label>
    <p id={`${id}-note-hint`}>Opcional. {Array.from(fields.note).length} de 500 caracteres Unicode. Visível no catálogo e no vale.</p>
    <p id={`${id}-note-error`} role="alert" className="stores-error">{errors.note}</p>
    <label className="stores-field" htmlFor={`${id}-instructions`}>Instruções para combinar<textarea ref={instructionsField} id={`${id}-instructions`} value={fields.instructions} readOnly={locked} disabled={busy} rows={3}
      aria-invalid={errors.instructions ? true : undefined} aria-describedby={`${id}-instructions-hint${errors.instructions ? ` ${id}-instructions-error` : ''}`} onChange={event => set('instructions', event.target.value)} /></label>
    <p id={`${id}-instructions-hint`}>Opcionais. {Array.from(fields.instructions).length} de 1.000 caracteres Unicode.</p>
    <p id={`${id}-instructions-error`} role="alert" className="stores-error">{errors.instructions}</p>
    <fieldset disabled={busy || locked}><legend>Disponibilidade e estoque</legend>
      <label className={styles.choice}><input type="checkbox" checked={fields.available} onChange={event => set('available', event.target.checked)} />Disponível para resgate</label>
      <label className={styles.choice}><input type="checkbox" checked={fields.stock === null} onChange={event => set('stock', event.target.checked ? null : 0)} />Estoque ilimitado</label>
      {fields.stock !== null && <Input ref={stockField} label="Quantidade disponível agora" type="number" inputMode="numeric" min={0} max={1_000_000} step={1} required value={Number.isNaN(fields.stock) ? '' : fields.stock}
        hint="De 0 a 1.000.000 unidades. Zero significa esgotado." error={errors.stock} onChange={event => set('stock', event.target.valueAsNumber)} />}</fieldset>
    <p>As mudanças valem para novos resgates. Os tickets anteriores preservam o mimo e o custo da ocasião.</p>
    {locked && <p>Os campos estão preservados. Resolva a solicitação ou revise a versão atual antes de salvar.</p>}
    <div className="stores-actions"><Button variant="secondary" onClick={() => setPreview(value => !value)}>{preview ? 'Fechar prévia' : 'Ver prévia'}</Button>
      <Button type="submit" disabled={busy || !canSubmit}>{busy ? 'Confirmando…' : submitLabel}</Button></div>
    {preview && <RewardPreview reward={fields} />}
  </form>;
}
