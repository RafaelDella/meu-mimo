'use client';

import type { StoreView } from '@/contracts/stores';
import { ConfirmAction, Feedback } from './store-controls';
import { StoreForm } from './store-form';
import type { StoreFields } from './store-form';
import { storeRequest, useStoreAction } from './store-api';

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
  return <section className="stores-card" aria-busy={action.busy}><h2>Configurações da loja</h2><Feedback {...action} />
    {store.state === 'CLOSED' ? <p>A loja está encerrada. As informações permanecem disponíveis para consulta.</p> : <>
      <StoreForm initial={{ name: store.name ?? '', presentation: store.presentation, timezone: store.timezone }} busy={action.busy} onSave={save} submitLabel="Salvar alterações" />
      <div className="stores-lifecycle"><h3>Estado da loja</h3>
        <p>Pausar interrompe novos convites, conquistas e resgates. O histórico e o tratamento de pendências continuam disponíveis.</p>
        <div className="stores-actions">{store.state === 'ACTIVE' ?
          <ConfirmAction label="Pausar loja" title="Pausar esta loja?" description="Novos convites, conquistas e resgates ficam suspensos até você retomar a loja. O acesso privado ao histórico é preservado."
            confirmLabel="Confirmar pausa" busy={action.busy} error={action.error} onConfirm={close => change('pause', close)} /> :
          <ConfirmAction label="Retomar loja" title="Retomar esta loja?" description="A loja volta a receber convites e novas ações das participações ativas."
            confirmLabel="Confirmar retomada" busy={action.busy} error={action.error} onConfirm={close => change('resume', close)} />}
          <ConfirmAction label="Encerrar loja" title="Encerrar esta loja?" description="Este encerramento é definitivo. A loja sai das listas ativas e não recebe novas participações, conquistas ou resgates. Histórico e tickets existentes permanecem acessíveis; análises pendentes precisam ser resolvidas antes."
            confirmLabel="Confirmar encerramento" busy={action.busy} error={action.error} onConfirm={close => change('close', close)} />
        </div></div>
    </>}
  </section>;
}
