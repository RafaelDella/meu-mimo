'use client';

import { useEffect, useRef, useState } from 'react';
import type { PageResult, StoreView } from '@/contracts/stores';
import type { CodeInvitationCreated, ManagedInvitation } from '@/contracts/invitations';
import { Button } from '@/components/ui/button';
import { Pagination } from './store-controls';
import { storeError, useResource } from './store-api';
import { InvitationCodeCard, InvitationCredentialActions, InvitationPolicyDetails } from './invitation-code-card';
import { InvitationPolicyForm } from './invitation-policy-form';
import styles from './invitation-codes.module.css';

export { invitationStatus } from './invitation-code-card';

export function StoreInvitations({ store }: { store: StoreView }) {
  const title = useRef<HTMLHeadingElement>(null);
  const generatedTitle = useRef<HTMLHeadingElement>(null);
  const focusAfterRefresh = useRef(false);
  const [page, setPage] = useState(1);
  const [generated, setGenerated] = useState<CodeInvitationCreated | null>(null);
  const path = `/api/lojas/${store.id}/convites`;
  const list = useResource<PageResult<ManagedInvitation>>(`${path}?page=${page}&pageSize=20`);
  function refresh() { focusAfterRefresh.current = true; list.reload(); }
  useEffect(() => {
    if (list.loading || list.refreshing || !focusAfterRefresh.current) return;
    focusAfterRefresh.current = false; title.current?.focus();
  }, [list.loading, list.refreshing]);
  useEffect(() => { if (generated) generatedTitle.current?.focus(); }, [generated]);
  function created(value: CodeInvitationCreated) { setGenerated(value); list.reload(); }
  return <section aria-labelledby="invitations-title"><h2 id="invitations-title" ref={title} tabIndex={-1}>Convites</h2>
    <div className="stores-card"><InvitationPolicyForm store={store} onCreated={created} />
      {generated && <section className={styles.generated} aria-labelledby="generated-invitation-title">
        <h3 id="generated-invitation-title" ref={generatedTitle} tabIndex={-1}>Convite pronto para compartilhar</h3>
        {generated.kind === 'CODE' && <InvitationPolicyDetails invitation={generated} timezone={store.timezone} />}
        <InvitationCredentialActions key={generated.id} credential={generated} storeName={store.name} />
        <Button variant="secondary" onClick={() => { setGenerated(null); title.current?.focus(); }}>Ocultar convite gerado</Button>
      </section>}
    </div>
    <div aria-busy={list.loading}>{list.loading && <p role="status">Buscando convites…</p>}
      {list.error ? <div role="alert"><p>{storeError(list.error)}</p><Button variant="secondary" onClick={list.reload}>Tentar novamente</Button></div> : null}
      {list.data && <>{!list.data.items.length && <p>Nenhum convite foi gerado ainda.</p>}
        <div className="stores-grid">{list.data.items.map(invitation => <InvitationCodeCard key={invitation.id} invitation={invitation}
          storeId={store.id} storeName={store.name} timezone={store.timezone} onUpdate={() => {
            if (generated?.id === invitation.id) setGenerated(null);
            refresh();
          }} />)}</div>
        <Pagination page={list.data.page} pageSize={list.data.pageSize} total={list.data.total} onPage={value => { setPage(value); focusAfterRefresh.current = true; }} />
      </>}
    </div>
  </section>;
}
