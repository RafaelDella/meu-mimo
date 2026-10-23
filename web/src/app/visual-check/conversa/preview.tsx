'use client';

import Link from 'next/link';
import { useMemo, useRef, useState } from 'react';
import type { CommentView } from '@/contracts/conversations';
import { ConversationPanel } from '@/components/conversation/conversation-panel';
import type { ConversationTransport } from '@/components/conversation/transport';
import { StoreRequestError } from '@/components/stores/store-api';
import { Button } from '@/components/ui/button';

type Mode = 'normal' | 'uncertain' | 'delayed';
const firstId = '11111111-1111-4111-8111-111111111111';
const secondId = '22222222-2222-4222-8222-222222222222';

export function ConversationPreview() {
  const [context, setContext] = useState(firstId);
  const [confirmed, setConfirmed] = useState(0);
  const mode = useRef<Mode>('normal');
  const attempts = useRef(0);
  const readOnly = useRef(false);
  const failReadAfterSend = useRef(false);
  const failNextRead = useRef(false);
  const release = useRef<(() => void) | null>(null);
  const comments = useRef(new Map<string, CommentView>());
  const transport = useMemo<ConversationTransport>(() => ({
    async list(current, page) {
      if (failNextRead.current) {
        failNextRead.current = false;
        throw new StoreRequestError('demo_read_failed', 503, 'Não foi possível atualizar a conversa. Tente carregar novamente.');
      }
      const items = [...comments.current.values()].filter(item => item.conversationId === current.conversationId);
      return { conversation: { id: current.conversationId, storeId: current.storeId,
        participantMembershipId: current.conversationId, subjectType: 'TICKET', subjectId: current.conversationId,
        writable: !readOnly.current }, items: items.slice((page - 1) * 20, page * 20), page, pageSize: 20, total: items.length };
    },
    async send(current, body) {
      attempts.current += 1;
      let comment = comments.current.get(body.operationId);
      if (!comment) {
        if (readOnly.current) throw new StoreRequestError('conversation_read_only', 409,
          'Esta conversa está disponível somente para consulta.');
        comment = { id: body.operationId, conversationId: current.conversationId, text: body.text,
          createdAt: new Date().toISOString(), author: { id: current.conversationId,
            displayName: current.conversationId === firstId ? 'Ana de exemplo' : 'Bia de exemplo' } };
        comments.current.set(body.operationId, comment);
        setConfirmed(comments.current.size);
      }
      if (mode.current === 'uncertain' && attempts.current <= 2) throw new StoreRequestError('demo_failure',
        attempts.current === 1 ? 503 : 429, attempts.current === 1 ? 'A resposta se perdeu. Consulte o envio.' : 'Aguarde e consulte o mesmo envio.');
      if (mode.current === 'delayed') await new Promise<void>(resolve => { release.current = resolve; });
      if (failReadAfterSend.current) { failReadAfterSend.current = false; failNextRead.current = true; }
      return comment;
    },
  }), []);
  return <main className="stores-shell">
    <Link className="stores-link" href="/visual-check">Voltar à prévia</Link>
    <h1>Conversa de exemplo</h1>
    <p>Demonstração com dados fictícios em memória. Não cria registro, ticket ou conversa real. Recarregar descarta os exemplos.</p>
    <p>Contexto: {context === firstId ? 'Ana de exemplo' : 'Bia de exemplo'}. Comentários confirmados na demonstração: {confirmed}.</p>
    <div className="stores-actions" role="group" aria-label="Controles da demonstração">
      <Button variant="secondary" onClick={() => { mode.current = 'uncertain'; attempts.current = 0; }}>Simular resposta perdida</Button>
      <Button variant="secondary" onClick={() => { mode.current = 'delayed'; }}>Simular demora no envio</Button>
      <Button variant="secondary" onClick={() => { failReadAfterSend.current = true; }}>Simular falha ao atualizar após envio</Button>
      <Button variant="secondary" onClick={() => { release.current?.(); release.current = null; mode.current = 'normal'; }}>Liberar resposta</Button>
      <Button variant="secondary" onClick={() => setContext(value => value === firstId ? secondId : firstId)}>Alternar contexto de exemplo</Button>
      <Button variant="secondary" onClick={() => { readOnly.current = !readOnly.current; }}>Alternar somente consulta</Button>
      <Button variant="secondary" onClick={() => {
        for (const [id, comment] of comments.current) if (comment.conversationId === context) comments.current.delete(id);
        for (let index = 0; index < 39; index += 1) {
          const id = crypto.randomUUID();
          comments.current.set(id, { id, conversationId: context, text: `Comentário de exemplo ${index + 1}`,
            createdAt: new Date().toISOString(), author: { id: context,
              displayName: context === firstId ? 'Ana de exemplo' : 'Bia de exemplo' } });
        }
        setConfirmed(comments.current.size);
      }}>Semear 39 comentários fictícios</Button>
    </div>
    <ConversationPanel accountKey={context} storeId={context} conversationId={context} transport={transport} includeReactions={false} />
  </main>;
}
