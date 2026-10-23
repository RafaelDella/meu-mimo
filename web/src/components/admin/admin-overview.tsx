'use client';

import type { AdminOverview as Overview } from '@/contracts/admin';
import { Button } from '@/components/ui/button';
import { storeError } from '@/components/stores/store-api';
import { useAdminResource } from './transport';
import styles from './admin.module.css';

export function AdminOverview() {
  const resource = useAdminResource<Overview>('/api/admin/resumo'); const data = resource.data;
  return <section className={styles.stack}><h2>Visão geral</h2><p>As contas contadas aqui são perfis da aplicação. Cadastros apenas no provedor de identidade não entram neste total.</p>
    {resource.loading && <p role="status">Consultando os totais administrativos…</p>}{resource.error ? <p role="alert">{storeError(resource.error)}</p> : null}
    {data && <><h3>Contas</h3><dl className={styles.metrics}><div><dt>Acesso ativo</dt><dd>{data.accounts.active}</dd></div><div><dt>Bloqueadas por segurança</dt><dd>{data.accounts.blocked}</dd></div></dl>
      <h3>Lojas</h3><dl className={styles.metrics}><div><dt>Ativas pelo lojista</dt><dd>{data.stores.active}</dd></div><div><dt>Pausadas pelo lojista</dt><dd>{data.stores.paused}</dd></div><div><dt>Encerradas</dt><dd>{data.stores.closed}</dd></div><div><dt>Com pausa da plataforma</dt><dd>{data.stores.platformPaused}</dd></div></dl>
      <section className={styles.card}><h3>Últimos sete dias · UTC</h3><p>Janela: {new Date(data.window.from).toLocaleString('pt-BR', { timeZone: 'UTC' })} até {new Date(data.window.to).toLocaleString('pt-BR', { timeZone: 'UTC' })} · UTC.</p>
        <p>{data.recent.accountsCreated} perfis criados · {data.recent.storesCreated} lojas criadas · {data.recent.actions} ações administrativas.</p></section></>}
    <Button variant="secondary" onClick={resource.reload}>Atualizar visão geral</Button>
  </section>;
}
