'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { CodeInvitationCreated, CodeInvitationInput, ExpirationCandidate, ExpirationInput } from '@/contracts/invitations';
import type { StoreView } from '@/contracts/stores';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Feedback } from './store-controls';
import { StoreRequestError, storeRequest, useStoreAction } from './store-api';
import styles from './invitation-codes.module.css';

type ExpirationMode = ExpirationInput['kind'];
type Resolution = { localDateTime: string; timezone: string; candidates: ExpirationCandidate[] };

export function InvitationPolicyForm({ store, onCreated }: {
  store: StoreView; onCreated: (value: CodeInvitationCreated) => void;
}) {
  const id = useId();
  const action = useStoreAction();
  const pending = useRef<CodeInvitationInput | null>(null);
  const dateField = useRef<HTMLInputElement>(null);
  const limitField = useRef<HTMLInputElement>(null);
  const [expirationMode, setExpirationMode] = useState<ExpirationMode>('AFTER_DAYS');
  const [localDateTime, setLocalDateTime] = useState('');
  const [usesMode, setUsesMode] = useState('LIMITED');
  const [maxUses, setMaxUses] = useState('1');
  const [dateError, setDateError] = useState('');
  const [limitError, setLimitError] = useState('');
  const [resolution, setResolution] = useState<Resolution | null>(null);
  const [selectedAt, setSelectedAt] = useState('');
  const [uncertain, setUncertain] = useState(false);
  const [waitSeconds, setWaitSeconds] = useState(0);
  const available = store.state === 'ACTIVE' && !store.platformPausedAt;
  const locked = action.busy || uncertain || !available;
  const confirmed = resolution?.localDateTime === localDateTime ? resolution : null;
  const timezone = confirmed?.timezone ?? store.timezone;

  useEffect(() => {
    if (!waitSeconds) return;
    const timer = setTimeout(() => setWaitSeconds(value => Math.max(0, value - 1)), 1000);
    return () => clearTimeout(timer);
  }, [waitSeconds]);

  function clearDate() {
    setResolution(null); setSelectedAt(''); setDateError('');
  }
  function checkDate() {
    setDateError('');
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(localDateTime)) {
      setDateError('Informe a data e a hora no fuso da loja.'); dateField.current?.focus(); return;
    }
    void action.run(async signal => {
      try {
        return await storeRequest<{ timezone: string; candidates: ExpirationCandidate[] }>(`/api/lojas/${store.id}/convites/prazo`,
          'POST', { localDateTime }, signal, { notifyChange: false });
      } catch (cause) {
        if (!signal.aborted) setDateError(cause instanceof StoreRequestError ? cause.message : 'Não foi possível conferir este horário. Tente novamente.');
        throw cause;
      }
    }, value => {
      setResolution({ ...value, localDateTime });
      setSelectedAt(value.candidates.length === 1 ? value.candidates[0].at : '');
      if (!value.candidates.length) setDateError('Este horário não existe no fuso da loja. Escolha outro horário.');
      else if (value.candidates.length > 1) action.setMessage('Este horário ocorre duas vezes. Escolha a ocorrência antes de gerar.');
    });
  }

  function policy(): Omit<CodeInvitationInput, 'operationId' | 'kind'> | null {
    setDateError(''); setLimitError('');
    if (usesMode === 'LIMITED' && (!/^\d+$/.test(maxUses) || Number(maxUses) < 1 || Number(maxUses) > 1_000_000)) {
      setLimitError('Informe um inteiro entre 1 e 1.000.000.'); limitField.current?.focus(); return null;
    }
    let expiration: ExpirationInput;
    if (expirationMode === 'AT') {
      if (!confirmed || !selectedAt || !confirmed.candidates.some(candidate => candidate.at === selectedAt)) {
        setDateError(confirmed && confirmed.candidates.length > 1 ? 'Escolha qual ocorrência deste horário você quer usar.' :
          'Confira a data e a hora antes de gerar o convite.');
        dateField.current?.focus(); return null;
      }
      expiration = { kind: 'AT', at: selectedAt };
    } else expiration = expirationMode === 'NEVER' ? { kind: 'NEVER' } : { kind: 'AFTER_DAYS', days: 7 };
    return { expiration, maxUses: usesMode === 'UNLIMITED' ? null : Number(maxUses) };
  }

  function generate() {
    if (!pending.current) {
      const value = policy();
      if (!value || !available) return;
      pending.current = { operationId: crypto.randomUUID(), kind: 'CODE', ...value };
    }
    const request = pending.current;
    void action.run(async signal => {
      try { return await storeRequest<CodeInvitationCreated>(`/api/lojas/${store.id}/convites`, 'POST', request, signal); }
      catch (cause) {
        if (signal.aborted) throw cause;
        if (cause instanceof StoreRequestError && cause.retryAfter) setWaitSeconds(cause.retryAfter);
        // A gestão recupera a operação existente antes de validar seu prazo.
        // Este erro específico confirma que a tentativa não gravou um convite.
        const expirationRejected = request.expiration.kind === 'AT' && cause instanceof StoreRequestError &&
          cause.status === 400 && cause.code === 'invitation_expiration_past';
        if (expirationRejected || (!uncertain && cause instanceof StoreRequestError && cause.status === 400)) {
          pending.current = null; setUncertain(false);
          if (expirationRejected) {
            clearDate(); setDateError(cause.message); setWaitSeconds(0);
            requestAnimationFrame(() => dateField.current?.focus());
          }
        } else setUncertain(true);
        throw cause;
      }
    }, value => {
      pending.current = null; setUncertain(false); setWaitSeconds(0);
      action.setMessage('Convite gerado. Escolha como compartilhar.'); onCreated(value);
    });
  }

  return <form noValidate onSubmit={event => { event.preventDefault(); if (!action.busy && !waitSeconds) generate(); }}>
    <p>Compartilhe um código ou um link para convidar alguém. Cada nova pessoa que entrar consome um uso; acessar novamente não consome.</p>
    <fieldset className={styles.policy} disabled={locked}>
      <legend>Configuração do próximo convite</legend>
      <div className={styles.policyGrid}>
        <label className="stores-field" htmlFor={`${id}-expiration`}>Validade do convite
          <select id={`${id}-expiration`} className="ui-input" value={expirationMode} onChange={event => { setExpirationMode(event.target.value as ExpirationMode); clearDate(); }}>
            <option value="AFTER_DAYS">Sete dias</option><option value="NEVER">Sem vencimento</option><option value="AT">Data e hora personalizadas</option>
          </select>
        </label>
        <label className="stores-field" htmlFor={`${id}-uses`}>Limite de participantes
          <select id={`${id}-uses`} className="ui-input" value={usesMode} onChange={event => { setUsesMode(event.target.value); setLimitError(''); }}>
            <option value="LIMITED">Definir um limite</option><option value="UNLIMITED">Ilimitados</option>
          </select>
        </label>
        {usesMode === 'LIMITED' && <Input ref={limitField} label="Máximo de novas participações" inputMode="numeric" value={maxUses} maxLength={7}
          hint="De 1 a 1.000.000 novas pessoas." error={limitError} onChange={event => { setMaxUses(event.target.value); setLimitError(''); }} />}
      </div>
      {expirationMode === 'AT' && <div className={styles.date}>
        <Input ref={dateField} label="Data e hora de vencimento" type="datetime-local" step={60} value={localDateTime}
          hint={`Fuso da loja: ${timezone}. Confira antes de gerar.`} error={dateError}
          onChange={event => { setLocalDateTime(event.target.value); clearDate(); }} />
        <Button variant="secondary" onClick={checkDate}>Conferir data e hora</Button>
        {confirmed && confirmed.candidates.length > 1 && <fieldset className={styles.occurrences}>
          <legend>Escolha qual ocorrência deste horário</legend>
          {confirmed.candidates.map(candidate => <label className={styles.radio} key={candidate.at}>
            <input type="radio" name={`${id}-occurrence`} value={candidate.at} checked={selectedAt === candidate.at}
              onChange={() => { setSelectedAt(candidate.at); setDateError(''); }} />
            {localDateTime.replace('T', ' ')} · UTC{candidate.offset}
          </label>)}
        </fieldset>}
        {confirmed && selectedAt && <p role="status">Vencimento conferido: {new Date(selectedAt).toLocaleString('pt-BR', { timeZone: timezone })} · {timezone} · UTC{confirmed.candidates.find(candidate => candidate.at === selectedAt)?.offset}.</p>}
      </div>}
      <div className={styles.policySummary}>
        <p>{expirationMode === 'AFTER_DAYS' ? 'Sete dias a partir da geração.' : expirationMode === 'NEVER' ? 'Sem vencimento.' : 'A validade usa a data conferida no fuso da loja.'}</p>
        <p>{usesMode === 'UNLIMITED' ? 'Participações ilimitadas' : `${maxUses || '—'} ${maxUses === '1' ? 'nova participação' : 'novas participações'}`}</p>
        <p>Prazo e limite não podem ser editados depois de gerar. Você pode revogar e criar outro convite.</p>
      </div>
    </fieldset>
    <Feedback {...action} />
    {available || uncertain ? <Button type="submit" disabled={action.busy || waitSeconds > 0}>{uncertain ? 'Recuperar convite' : 'Gerar convite'}</Button> :
      <p>{store.platformPausedAt ? 'A pausa da plataforma impede novos convites. Os convites anteriores continuam no histórico.' : 'Retome a loja para gerar convites. Lojas encerradas permanecem somente para consulta.'}</p>}
    {uncertain && <p>Use “Recuperar convite” para consultar a mesma solicitação com o prazo e o limite originais.</p>}
    {waitSeconds > 0 && <p role="status">Aguarde {waitSeconds} segundos para recuperar.</p>}
  </form>;
}
