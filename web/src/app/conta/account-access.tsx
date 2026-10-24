'use client';

import { useId, useState } from 'react';
import type { FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MimoIcon } from '@/components/ui/mimo-icon';
import { MimoSticker } from '@/components/ui/mimo-page';

export type AccessMode = 'login' | 'signup' | 'recovery';
type Props = {
  mode: AccessMode; recovery: boolean; busy: boolean; loading: boolean; checking: boolean;
  sent: boolean; email: string; password: string;
  onMode: (mode: AccessMode) => void; onEdit: () => void;
  onEmail: (value: string) => void; onPassword: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

function PasswordField({ fresh, recovery, value, disabled, onChange, onForgot }: {
  fresh: boolean; recovery: boolean; value: string; disabled: boolean; onChange: (value: string) => void; onForgot?: () => void;
}) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  return <div className="account-password">
    <Input id={id} label={recovery ? 'Nova senha' : 'Senha'} name="password" type={visible ? 'text' : 'password'}
      value={value} onChange={event => onChange(event.target.value)}
      autoComplete={fresh ? 'new-password' : 'current-password'}
      hint={fresh ? 'Use pelo menos oito caracteres.' : undefined}
      minLength={fresh ? 8 : 1} maxLength={256} required disabled={disabled} />
    <div className="account-password-actions">
    {onForgot && <button className="account-text-action" type="button" disabled={disabled} onClick={onForgot}>Recuperar senha</button>}
    <button className="account-text-action account-reveal" type="button" disabled={disabled}
      aria-controls={id} aria-pressed={visible} aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'} onClick={() => setVisible(!visible)}>
      <MimoIcon name="eye" />{visible ? 'Ocultar' : 'Mostrar'}
    </button>
    </div>
  </div>;
}

export function AccountAccess(props: Props) {
  const { mode, recovery, busy, loading, checking, sent, email, password, onMode, onEdit, onEmail, onPassword, onSubmit } = props;
  const disabled = loading || busy || checking;
  return <div hidden={checking} inert={checking}>
    {!recovery && <nav className="account-tabs" aria-label="Acesso à conta">
      <Button disabled={disabled} variant="secondary" aria-pressed={mode === 'login'} onClick={() => onMode('login')}><MimoIcon name="heart" />Entrar</Button>
      <Button disabled={disabled} variant="secondary" aria-pressed={mode === 'signup'} onClick={() => onMode('signup')}><MimoIcon name="people" />Criar conta</Button>
    </nav>}
    {sent && !recovery ? <div className="account-mail-sent">
      <MimoSticker kind="envelope" />
      <p>Se os dados estiverem corretos, o link chegará a <strong>{email}</strong>. Confira também a pasta de spam.</p>
      <p>{mode === 'signup' ? 'Abra o link neste navegador para confirmar seu e-mail e continuar.' : 'Abra o link neste navegador para escolher uma nova senha.'}</p>
      <div className="account-actions">
        <Button variant="secondary" onClick={onEdit}>Corrigir e-mail</Button>
        <button className="account-text-action" type="button" onClick={() => onMode('login')}>Voltar para entrar</button>
      </div>
    </div> : <form className="account-form" onSubmit={onSubmit} aria-describedby="account-description account-error">
      {!recovery && <Input label="E-mail" name="email" type="email" value={email} onChange={event => onEmail(event.target.value)}
        autoComplete="username" inputMode="email" autoCapitalize="none" spellCheck={false} maxLength={254} required disabled={disabled} />}
      {(recovery || mode !== 'recovery') && <>
        <PasswordField key={`${mode}-${recovery}`} fresh={recovery || mode === 'signup'} recovery={recovery} value={password} onChange={onPassword} disabled={disabled}
          onForgot={!recovery && mode === 'login' ? () => onMode('recovery') : undefined} />
      </>}
      {mode === 'signup' && !recovery && <p className="account-confirm-note"><MimoIcon name="mail" />Você vai receber um e-mail para confirmar sua conta antes de entrar.</p>}
      <Button className="account-submit" type="submit" aria-disabled={disabled} onClick={event => { if (disabled) event.preventDefault(); }}>
        {busy ? 'Só um instante…' : recovery ? 'Salvar nova senha' : mode === 'login' ? 'Entrar' : mode === 'signup' ? 'Criar conta' : 'Enviar link de recuperação'}
        <MimoIcon name="arrow" />
      </Button>
      {mode === 'recovery' && !recovery && <button className="account-text-action" type="button" disabled={disabled} onClick={() => onMode('login')}>Voltar para entrar</button>}
    </form>}
    {!sent && <p className="account-access-note"><MimoIcon name="lock" />Seu acesso é pessoal. As lojinhas são compartilhadas por convite.</p>}
  </div>;
}
