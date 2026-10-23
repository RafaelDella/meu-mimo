'use client';

import Link from 'next/link';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { FormEvent } from 'react';
import type { PointsEntryView } from '@/contracts/activities';
import type { PageResult, StoreView } from '@/contracts/stores';
import { useResource, storeError } from '@/components/stores/store-api';
import type { StoreRequestError } from '@/components/stores/store-api';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Pagination } from '@/components/activities/activity-display';
import { localTime } from '@/components/activities/format';
import { signedPoints } from '@/components/submissions/review-display';
import { StatementPeople } from './statement-people';
import { StatementBalance } from './statement-balance';
import { useStatementAccess } from './use-statement-access';
import { RewardAccess, useRewardAccess } from '@/components/rewards/access';
import { RewardTabs } from '@/components/rewards/reward-area';
import { RewardCounter } from '@/components/rewards/reward-summary';
import styles from './statement.module.css';

const kinds = { ACTIVITY_CREDIT: 'Ganho por atividade', ACTIVITY_REVERSAL: 'Estorno de conquista', ACTIVITY_RESTORE: 'Recomposição de pontos', REDEMPTION_DEBIT: 'Resgate de mimo', REDEMPTION_REFUND: 'Devolução de resgate' };
function originName(entry: PointsEntryView) { return entry.origin?.name ?? entry.rewardName ?? entry.activityName ?? 'Origem do movimento'; }
function dateKey(value: string, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: timezone }).formatToParts(new Date(value));
  return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type)?.value ?? '').join('-');
}
function originPath(entry: PointsEntryView, returnTo: string) {
  const parts = entry.path.split('?');
  const query = new URLSearchParams(parts[1]); query.set('voltar', returnTo);
  return `${parts[0]}?${query}`;
}
function StatementContent({ store, query: initialQuery }: { store: StoreView; query: string }) {
  const id = useId();
  const router = useRouter();
  const title = useRef<HTMLHeadingElement>(null);
  const endDate = useRef<HTMLInputElement>(null);
  const initial = new URLSearchParams(initialQuery);
  const [filters, setFilters] = useState({ kind: initial.get('kind') ?? '', from: initial.get('from') ?? '', to: initial.get('to') ?? '', membershipId: initial.get('membershipId') ?? '' });
  const [invalid, setInvalid] = useState(false);
  const [denied, setDenied] = useState(false);
  const denyArea = useRewardAccess();
  const unavailable = useCallback((cause: StoreRequestError) => {
    setDenied(true);
    denyArea(cause);
  }, [denyArea]);
  const basePath = `/lojas/${encodeURIComponent(store.id)}/extrato`;
  const applied = new URLSearchParams(initialQuery);
  const membershipId = applied.get('membershipId') ?? '';
  const { data, loading, error, reload } = useResource<PageResult<PointsEntryView>>(`/api/lojas/${encodeURIComponent(store.id)}/pontos/movimentos?${applied}`);
  const accessDenied = useStatementAccess(error, unavailable);
  const returnTo = `${basePath}${initialQuery ? `?${initialQuery}` : ''}`;
  useEffect(() => { title.current?.focus(); }, [initialQuery, denied]);
  function navigate(nextPage: number, values = filters) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(values)) if (value) params.set(key, value);
    params.set('page', String(nextPage)); router.push(`${basePath}?${params}`);
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (filters.from && filters.to && filters.from > filters.to) { setInvalid(true); endDate.current?.focus(); return; }
    setInvalid(false); navigate(1);
  }
  const groups = new Map<string, PointsEntryView[]>();
  for (const entry of data?.items ?? []) {
    const key = dateKey(entry.createdAt, store.timezone); groups.set(key, [...(groups.get(key) ?? []), entry]);
  }
  if (denied || accessDenied) return <section className="stores-card"><h2 ref={title} tabIndex={-1}>Extrato indisponível</h2>
    <p role="alert">O acesso a este extrato não está disponível para esta conta. Reabra uma loja autorizada para continuar.</p></section>;
  return <section className={styles.area} aria-labelledby={`${id}-title`}>
    {store.role === 'PARTICIPANT' && <RewardTabs store={store} active="statement" />}
    <h2 id={`${id}-title`} tabIndex={-1} ref={title}>Extrato de pontos</h2>
    <p className={styles.context}>Loja: {store.name || 'Sua lojinha'}. Datas e horários em {store.timezone}.</p>
    <div className={styles.layout}><div className={styles.main}>
    <form className={styles.filters} aria-label="Filtros do extrato" onSubmit={submit}>
      {store.role === 'MERCHANT' && <StatementPeople storeId={store.id} value={filters.membershipId} onChange={value => setFilters(current => ({ ...current, membershipId: value }))} onUnavailable={unavailable} />}
      <label className="stores-field">Tipo de movimento<select className="ui-input" value={filters.kind} onChange={event => setFilters(current => ({ ...current, kind: event.target.value }))}>
        <option value="">Todos os movimentos</option>{Object.entries(kinds).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <Input label="Movimentos desde a data" name="from" type="date" value={filters.from} onChange={event => setFilters(current => ({ ...current, from: event.target.value }))} />
      <Input ref={endDate} label="Movimentos até a data" name="to" type="date" aria-invalid={invalid || undefined} aria-describedby={invalid ? `${id}-period-error` : undefined} value={filters.to} onChange={event => { setInvalid(false); setFilters(current => ({ ...current, to: event.target.value })); }} />
      {invalid && <p id={`${id}-period-error`} className={styles.periodError} role="alert">A data final precisa ser igual ou posterior à inicial.</p>}<Button type="submit">Filtrar extrato</Button>
    </form>
    {loading && <p role="status">Consultando movimentos…</p>}
    {error ? <div role="alert"><p>{storeError(error)}</p><Button variant="secondary" onClick={reload}>Consultar extrato novamente</Button></div> : null}
    {data && <>{!data.items.length && <p>Nenhum movimento encontrado com estes filtros.</p>}
      {[...groups].map(([date, items]) => <section key={date} className={`stores-card ${styles.day}`}><h3>{date.split('-').reverse().join('/')}</h3>
        <ol role="list" className={styles.movements}>{items.map(entry => <li key={entry.id}><h4><span className={BigInt(entry.amount) < 0n ? styles.debit : styles.credit}>{signedPoints(entry.amount)} pontos</span> · {originName(entry)}</h4>
          <p>{kinds[entry.kind]} · {store.role === 'MERCHANT' ? `${entry.participant.displayName || 'Pessoa participante'} · ` : ''}{entry.actor.displayName || 'Pessoa da relação'}</p>
          <p><time dateTime={entry.createdAt}>{localTime(entry.createdAt, store.timezone)}</time></p>
          {entry.compensatesEntryId && <p>{entry.kind === 'REDEMPTION_REFUND' ? 'Esta devolução compensa o débito original deste resgate.' : 'Este ajuste compensa um movimento anterior da mesma conquista.'}</p>}
          <Link className="stores-link" href={originPath(entry, returnTo)}>Abrir origem do movimento<span className={styles.srOnly}>: {originName(entry)}, {kinds[entry.kind]}</span></Link></li>)}</ol></section>)}
      <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={next => navigate(next, { kind: applied.get('kind') ?? '', from: applied.get('from') ?? '', to: applied.get('to') ?? '', membershipId })} />
    </>}
    <Link className="stores-link" href={`/lojas/${store.id}/atividades`}>Voltar às atividades e ao potinho</Link>
    </div><aside className={styles.support} aria-label="Saldo e orientações do extrato">
      {store.role === 'MERCHANT' && !membershipId ? <div className="stores-card"><h3>Saldo por pessoa</h3><p>Movimentos de todas as pessoas desta loja. Selecione uma participação para consultar o saldo individual.</p></div> :
        <div><p className={styles.balanceHint}>Saldo atual, independente do período filtrado.</p><StatementBalance storeId={store.id} storeName={store.name || 'Sua lojinha'} membershipId={membershipId} onUnavailable={unavailable} /></div>}
      {store.role === 'PARTICIPANT' && <div className="stores-card"><RewardCounter store={store} /></div>}
      <section className={`stores-card ${styles.guide}`} aria-label="Entenda os movimentos"><h3>Entenda os movimentos</h3><p>Ganhos por atividade, estornos, recomposições, resgates e devoluções são movimentos distintos. Devoluções não são ganhos por atividade. Pontos em análise ainda não integram o saldo disponível.</p></section>
    </aside></div>
  </section>;
}
export function StatementArea(props: { store: StoreView; query: string }) {
  return <RewardAccess><StatementContent {...props} /></RewardAccess>;
}
