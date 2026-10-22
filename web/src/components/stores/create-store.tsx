'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import type { StoreView } from '@/contracts/stores';
import { PrivateArea } from './private-area';
import { Feedback } from './store-controls';
import { StoreForm } from './store-form';
import type { StoreFields } from './store-form';
import { StoreRequestError, storeRequest, useStoreAction } from './store-api';

function CreateForm() {
  const router = useRouter();
  const action = useStoreAction();
  const pending = useRef<(StoreFields & { operationId: string }) | null>(null);
  const [uncertain, setUncertain] = useState(false);
  function save(fields: StoreFields) {
    pending.current ??= { ...fields, operationId: crypto.randomUUID() };
    const body = pending.current;
    void action.run(async signal => {
      try { return await storeRequest<StoreView>('/api/lojas', 'POST', body, signal); }
      catch (cause) {
        if (signal.aborted) throw cause;
        if (!uncertain && cause instanceof StoreRequestError && cause.status === 400) { pending.current = null; setUncertain(false); }
        else setUncertain(true);
        throw cause;
      }
    }, store => { router.push(`/lojas/${store.id}`); });
  }
  return <section className="stores-card" aria-busy={action.busy}>
    <Feedback {...action} /><StoreForm busy={action.busy} locked={uncertain} onSave={save} submitLabel={uncertain ? 'Consultar criação' : 'Criar lojinha'} />
  </section>;
}

export function CreateStore() {
  return <main className="stores-shell"><Link className="stores-link" href="/lojas">Minhas lojas</Link><h1>Criar lojinha</h1>
    <p>Prepare um cantinho de carinho para quem você quer convidar.</p>
    <PrivateArea>{session => <CreateForm key={session.sessionId} />}</PrivateArea></main>;
}
