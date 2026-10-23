import { StoreWorkspace } from '@/components/stores/store-workspace';
import { safeMuralReturn } from '@/components/feed/safe-mural-return';
export default async function TicketPage({ params, searchParams }: {
  params: Promise<{ storeId: string; ticketId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { storeId, ticketId } = await params; const query = await searchParams;
  const returnTo = safeMuralReturn(storeId, query.voltar) ?? (typeof query.voltar === 'string' && [`/lojas/${storeId}/extrato`, `/lojas/${storeId}/tickets`].includes(query.voltar.split('?')[0]) ? query.voltar : undefined);
  return <StoreWorkspace storeId={storeId} section="tickets" rewardRoute={{ view: 'ticket', ticketId, returnTo }} />;
}
