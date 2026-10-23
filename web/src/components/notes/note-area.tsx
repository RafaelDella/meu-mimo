'use client';

import { useSearchParams } from 'next/navigation';
import type { NoteCurrent, ParticipantNoteCurrent } from '@/contracts/notes';
import { Button } from '@/components/ui/button';
import { storeError } from '@/components/stores/store-api';
import { useRelationshipResource } from '@/components/notifications/use-relationship-resource';
import { NoteEditor } from './note-editor';
import { NoteReader } from './note-reader';

export function OwnNote({ storeId }: { storeId: string }) {
  const resource = useRelationshipResource<ParticipantNoteCurrent>(`/api/lojas/${storeId}/bilhete`);
  const query = useSearchParams();
  return <>{resource.loading && <p role="status">Consultando seu bilhete…</p>}
    {resource.error && !resource.denied ? <div role="alert"><p>{storeError(resource.error)}</p><Button variant="secondary" onClick={resource.reload}>Consultar bilhete novamente</Button></div> : null}
    {resource.data && <NoteReader storeId={storeId} note={resource.data} requestedVersion={query.get('bilhete') ?? undefined} requestedOpen={query.get('abrirBilhete') === '1'} />}</>;
}
export function ParticipantNote({ storeId, membershipId }: { storeId: string; membershipId: string }) {
  const resource = useRelationshipResource<NoteCurrent>(`/api/lojas/${storeId}/participacoes/${membershipId}/bilhete`);
  return <>{resource.loading && <p role="status">Consultando bilhete da relação…</p>}
    {resource.error && !resource.denied ? <div role="alert"><p>{storeError(resource.error)}</p><Button variant="secondary" onClick={resource.reload}>Consultar bilhete novamente</Button></div> : null}
    {resource.data && <NoteEditor storeId={storeId} membershipId={membershipId} note={resource.data} reload={resource.reload} />}</>;
}
