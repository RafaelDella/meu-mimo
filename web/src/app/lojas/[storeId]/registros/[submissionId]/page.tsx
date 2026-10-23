import { StoreWorkspace } from '@/components/stores/store-workspace';
import { safeMuralReturn } from '@/components/feed/safe-mural-return';
export default async function SubmissionPage({ params, searchParams }: {
  params: Promise<{ storeId: string; submissionId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { storeId, submissionId } = await params;
  const query = await searchParams;
  const eventId = typeof query.evento === 'string' && /^[0-9a-f-]{36}$/i.test(query.evento) ? query.evento : undefined;
  const returnTo = safeMuralReturn(storeId, query.voltar) ?? (typeof query.voltar === 'string' && query.voltar.split('?')[0] === `/lojas/${storeId}/extrato` ? query.voltar : undefined);
  return <StoreWorkspace storeId={storeId} section="activities" activityRoute={{ view: 'submission', submissionId, eventId, returnTo }} />;
}
