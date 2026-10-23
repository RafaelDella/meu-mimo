'use client';

import { useId } from 'react';
import { illustrations, isIllustration } from '@/contracts/illustrations';
import type { Illustration } from '@/contracts/illustrations';
import { MimoIllustration } from './mimo-illustration';
import styles from './illustration-select.module.css';

type Props = { disabled: boolean } & (
  { optional?: false; value: Illustration; onChange: (value: Illustration) => void } |
  { optional: true; value: Illustration | ''; onChange: (value: Illustration | '') => void }
);

export function IllustrationSelect(props: Props) {
  const id = useId();
  const selected = illustrations.find(option => option.value === props.value);
  return <div className={styles.field}>
    <label htmlFor={id}>{props.optional ? 'Ilustração (opcional)' : 'Ilustração'}</label>
    <select id={id} className="ui-input" value={props.value} disabled={props.disabled} onChange={event => {
      const value = event.target.value;
      if (isIllustration(value)) props.onChange(value);
      else if (props.optional && value === '') props.onChange('');
    }}>
      {props.optional && <option value="">Sem ilustração</option>}
      {illustrations.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
    {selected && <div className={styles.preview} aria-hidden="true">
      <MimoIllustration name={selected.value} className={styles.illustration} /><span>{selected.label}</span>
    </div>}
  </div>;
}
