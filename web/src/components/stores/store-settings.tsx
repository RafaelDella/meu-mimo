'use client';

import type { StoreView } from '@/contracts/stores';
import { ConfirmAction, Feedback } from './store-controls';
import { StoreForm } from './store-form';
import type { StoreFields } from './store-form';
import { storeRequest, useStoreAction } from './store-api';
import { StatusBadge } from '@/components/ui/status-badge';
import styles from './settings.module.css';

export function StoreSettings({ store, onUpdate }: { store: StoreView; onUpdate: () => void }) {
  const action = useStoreAction();
  const path = `/api/lojas/${store.id}`;
  function save(fields: StoreFields) {
    void action.run(async signal => {
      try { return await storeRequest<StoreView>(path, 'PATCH', fields, signal); }
      catch (cause) {
        if (signal.aborted) throw cause;
        const current = await storeRequest<StoreView>(path, 'GET', undefined, signal);
        if (current.name === fields.name && current.presentation === fields.presentation && current.timezone === fields.timezone) return current;
        throw cause;
      }
    }, () => { action.setMessage('As informações da loja foram salvas.'); onUpdate(); });
  }
  function change(next: 'pause' | 'resume' | 'close', close: () => void) {
    const expected = next === 'pause' ? 'PAUSED' : next === 'resume' ? 'ACTIVE' : 'CLOSED';
    void action.run(async signal => {
      try { return await storeRequest<StoreView>(`${path}/estado`, 'POST', { action: next }, signal); }
      catch (cause) {
        if (signal.aborted) throw cause;
        const current = await storeRequest<StoreView>(path, 'GET', undefined, signal);
        if (current.state === expected) return current;
        throw cause;
      }
    }, () => { close(); onUpdate(); });
  }
  const stateLabels = { ACTIVE: 'Ativa', PAUSED: 'Pausada', CLOSED: 'Encerrada' };
  return <section className={styles.area} aria-busy={action.busy}><h2>Configurações da loja</h2>
    <p className={styles.intro}>Cuide da identidade da sua lojinha e escolha quando receber novas ações.</p><Feedback {...action} />
    <div className={styles.layout}>
      <section className={`stores-card ${styles.details}`} aria-label="Informações da loja"><h3>Identidade e apresentação</h3>
      {store.state === 'CLOSED' ? <><p>A loja está encerrada. As informações permanecem disponíveis para consulta.</p>
        <dl className={styles.readonly}><div><dt>Nome da loja</dt><dd>{store.name || 'Sua lojinha'}</dd></div>
          <div><dt>Apresentação</dt><dd>{store.presentation || 'Sem apresentação.'}</dd></div><div><dt>Fuso horário</dt><dd>{store.timezone}</dd></div></dl></> :
        <StoreForm initial={{ name: store.name ?? '', presentation: store.presentation, timezone: store.timezone }} busy={action.busy} onSave={save} submitLabel="Salvar alterações" />}
      </section>
      <aside className={styles.support} aria-label="Estado e acesso à loja"><section className={`stores-card ${styles.state}`}><h3>Estado da loja</h3>
        <StatusBadge tone={store.state === 'ACTIVE' ? 'success' : store.state === 'PAUSED' ? 'pending' : 'info'} text={stateLabels[store.state]} />
        {store.state === 'CLOSED' ? <p>Histórico e tickets existentes continuam acessíveis.</p> : <>
        <p>Pausar interrompe novos convites, conquistas e resgates. O histórico e o tratamento de pendências continuam disponíveis.</p>
        <div className="stores-actions">{store.state === 'ACTIVE' ?
          <ConfirmAction label="Pausar loja" title="Pausar esta loja?" description="Novos convites, conquistas e resgates ficam suspensos até você retomar a loja. O acesso privado ao histórico é preservado."
            confirmLabel="Confirmar pausa" busy={action.busy} error={action.error} onConfirm={close => change('pause', close)} /> :
          <ConfirmAction label="Retomar loja" title="Retomar esta loja?" description="A loja volta a receber convites e novas ações das participações ativas."
            confirmLabel="Confirmar retomada" busy={action.busy} error={action.error} onConfirm={close => change('resume', close)} />}
        </div></>}
      </section>
      {store.state !== 'CLOSED' && <section className={`stores-card ${styles.closure}`}><h3>Encerramento definitivo</h3>
          <p>Encerre a loja quando não quiser receber novas ações. O histórico e os tickets existentes permanecem acessíveis.</p>
          <ConfirmAction label="Encerrar loja" title="Encerrar esta loja?" description="Este encerramento é definitivo. A loja sai das listas ativas e não recebe novas participações, conquistas ou resgates. Histórico e tickets existentes permanecem acessíveis; análises pendentes precisam ser resolvidas antes."
            confirmLabel="Confirmar encerramento" busy={action.busy} error={action.error} onConfirm={close => change('close', close)} />
      </section>}
      </aside>
    </div>
  </section>;
}
