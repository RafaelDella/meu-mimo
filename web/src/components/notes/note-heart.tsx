'use client';

import Link from 'next/link';
import { useId } from 'react';
import type { ParticipantNoteCurrent } from '@/contracts/notes';
import { useRelationshipResource } from '@/components/notifications/use-relationship-resource';

export function NoteHeart({ storeId }: { storeId: string }) {
  const id = useId(); const resource = useRelationshipResource<ParticipantNoteCurrent>(`/api/lojas/${storeId}/bilhete`);
  return <span><Link className="stores-link" href={`/lojas/${storeId}?abrirBilhete=1`} aria-label="Coração: abrir bilhete" aria-describedby={id}>♡ Bilhete
    {resource.data?.unread && <span> · Bilhete não lido</span>}</Link>
    <span id={id} className="stores-muted">{resource.data?.current ? `Versão ${resource.data.current.version}${resource.data.unread ? ' ainda não lida.' : ' já lida.'}` : resource.loading ? 'Consultando bilhete.' : resource.error ? 'Indicador do bilhete indisponível.' : 'Nenhum bilhete recebido.'}</span>
  </span>;
}
