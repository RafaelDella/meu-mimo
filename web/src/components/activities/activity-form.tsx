'use client';

import { useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { ActivityFields, ActivityFrequency, ActivitySticker, ApprovalMode } from '@/contracts/activities';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import styles from './activities.module.css';

const initialFields: ActivityFields = { name: '', description: '', category: '', sticker: '', points: Number.NaN, frequency: 'DAILY', weeklyLimit: 1, approvalMode: 'MANUAL' };
export function ActivityForm({ initial, busy, locked, onSave, submitLabel, canSubmit = true }: {
  initial?: ActivityFields; busy: boolean; locked: boolean; onSave: (fields: ActivityFields) => void; submitLabel: string; canSubmit?: boolean;
}) {
  const id = useId();
  const nameField = useRef<HTMLInputElement>(null);
  const descriptionField = useRef<HTMLTextAreaElement>(null);
  const categoryField = useRef<HTMLInputElement>(null);
  const pointsField = useRef<HTMLInputElement>(null);
  const weeklyLimitField = useRef<HTMLInputElement>(null);
  const [fields, setFields] = useState(initial ?? initialFields);
  const [errors, setErrors] = useState<Partial<Record<keyof ActivityFields, string>>>({});
  function set<K extends keyof ActivityFields>(key: K, value: ActivityFields[K]) {
    setFields(previous => ({ ...previous, [key]: value })); setErrors(previous => ({ ...previous, [key]: undefined }));
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = { ...fields, name: fields.name.trim(), description: fields.description.trim(), category: fields.category.trim(), weeklyLimit: fields.frequency === 'WEEKLY' ? fields.weeklyLimit : 1 };
    const next: Partial<Record<keyof ActivityFields, string>> = {};
    if (!normalized.name) next.name = 'Escreva um nome para a atividade.';
    else if ([...normalized.name].length > 80) next.name = 'Use até 80 caracteres no nome da atividade.';
    if ([...normalized.description].length > 1000) next.description = 'Use até 1.000 caracteres na descrição.';
    if ([...normalized.category].length > 80) next.category = 'Use até 80 caracteres na categoria.';
    if (!Number.isInteger(normalized.points) || normalized.points < 1 || normalized.points > 1_000_000) next.points = 'Use um número inteiro de 1 a 1.000.000 pontos.';
    if (!Number.isInteger(normalized.weeklyLimit) || normalized.weeklyLimit < 1 || normalized.weeklyLimit > 100) next.weeklyLimit = 'Use um número inteiro de 1 a 100 registros por semana.';
    setErrors(next);
    if (Object.keys(next).length) {
      const first = next.name ? nameField : next.description ? descriptionField : next.category ? categoryField : next.points ? pointsField : weeklyLimitField;
      first.current?.focus(); return;
    }
    onSave(normalized);
  }
  return <form className="stores-form" onSubmit={submit} aria-busy={busy} noValidate>
    <Input ref={nameField} label="Nome da atividade" name="name" value={fields.name} required readOnly={locked} disabled={busy} hint="Até 80 caracteres." error={errors.name}
      onChange={event => set('name', event.target.value)} />
    <label className="stores-field" htmlFor={`${id}-description`}>Descrição<textarea ref={descriptionField} id={`${id}-description`} className="ui-input" rows={4} value={fields.description}
      readOnly={locked} disabled={busy} aria-invalid={errors.description ? true : undefined}
      aria-describedby={`${id}-description-hint${errors.description ? ` ${id}-description-error` : ''}`} onChange={event => set('description', event.target.value)} /></label>
    <p id={`${id}-description-hint`}>{[...fields.description].length} de 1.000 caracteres.</p>
    <p id={`${id}-description-error`} role="alert" className="stores-error">{errors.description}</p>
    <Input ref={categoryField} label="Categoria (opcional)" value={fields.category} readOnly={locked} disabled={busy} hint="Até 80 caracteres." error={errors.category} onChange={event => set('category', event.target.value)} />
    <label className="stores-field">Ilustração (opcional)<select className="ui-input" value={fields.sticker} disabled={busy || locked} onChange={event => set('sticker', event.target.value as ActivitySticker)}>
      <option value="">Sem ilustração</option><option value="gift">Presente</option><option value="coffee">Café</option><option value="takeout">Comidinha</option><option value="envelope">Cartinha</option></select></label>
    <Input ref={pointsField} label="Pontos por conquista aprovada" type="number" inputMode="numeric" min={1} max={1_000_000} step={1} required value={Number.isNaN(fields.points) ? '' : fields.points} error={errors.points}
      readOnly={locked} disabled={busy} onChange={event => set('points', event.target.valueAsNumber)} hint="Número inteiro entre 1 e 1.000.000 pontos." />
    <label className="stores-field">Frequência<select className="ui-input" value={fields.frequency} disabled={busy || locked} onChange={event => set('frequency', event.target.value as ActivityFrequency)}>
      <option value="ONCE">Uma vez por participante</option><option value="DAILY">Uma vez por dia</option><option value="WEEKLY">Até um limite por semana</option></select></label>
    {fields.frequency === 'WEEKLY' && <Input ref={weeklyLimitField} label="Registros por semana" type="number" min={1} max={100} step={1} required value={Number.isNaN(fields.weeklyLimit) ? '' : fields.weeklyLimit} error={errors.weeklyLimit}
      readOnly={locked} disabled={busy} onChange={event => set('weeklyLimit', event.target.valueAsNumber)} hint="De 1 a 100 por participante. A semana começa segunda-feira no fuso da loja; pode registrar várias vezes no mesmo dia." />}
    <p>A frequência é individual por participante. Alterações consideram os envios anteriores no período da nova regra.</p>
    <fieldset disabled={busy || locked}><legend>Aprovação dos pontos</legend><div className={styles.choices}>
      {([{ value: 'MANUAL', label: 'Precisa da minha aprovação' }, { value: 'AUTOMATIC', label: 'Liberar pontos automaticamente' }] as const).map(option =>
        <label key={option.value}><input type="radio" name={`${id}-approval`} checked={fields.approvalMode === option.value} value={option.value}
          onChange={() => set('approvalMode', option.value as ApprovalMode)} /><span>{option.label}</span></label>)}</div>
      <p>{fields.approvalMode === 'MANUAL' ? 'Cada envio aguarda sua análise. Os pontos só ficam disponíveis após aprovação.' : 'O envio confirmado credita os pontos uma única vez. A conquista ainda poderá ser contestada depois.'}</p>
    </fieldset>
    <p>As mudanças valem para novos envios. As conquistas anteriores mantêm os pontos e a regra da ocasião.</p>
    {locked && <p>Os campos ficam preservados enquanto consultamos a mesma solicitação.</p>}
    <Button type="submit" disabled={busy || !canSubmit}>{busy ? 'Confirmando…' : submitLabel}</Button>
  </form>;
}
