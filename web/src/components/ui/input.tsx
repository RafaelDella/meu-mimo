'use client';

import { useId } from 'react';
import type { ComponentPropsWithRef } from 'react';

export type InputProps = ComponentPropsWithRef<'input'> & {
  label: string;
  hint?: string;
  error?: string;
};

export function Input({
  label,
  hint,
  error,
  id,
  className = '',
  'aria-describedby': describedBy,
  'aria-invalid': invalid,
  ...props
}: InputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  const description = [describedBy, hint && hintId, error && errorId]
    .filter(Boolean).join(' ') || undefined;

  return (
    <div className="ui-field">
      <label htmlFor={inputId}>{label}</label>
      <input
        {...props}
        id={inputId}
        className={`ui-input ${className}`.trim()}
        aria-describedby={description}
        aria-invalid={error ? true : invalid}
      />
      {hint && <p className="ui-field-hint" id={hintId}>{hint}</p>}
      <p className="ui-field-error" id={errorId} aria-live="polite" aria-atomic="true">{error}</p>
    </div>
  );
}
