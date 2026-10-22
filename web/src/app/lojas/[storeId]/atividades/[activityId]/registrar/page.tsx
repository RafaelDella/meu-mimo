import { StoreWorkspace } from '@/components/stores/store-workspace';
export default async function RegisterActivityPage({ params, searchParams }: {
  params: Promise<{ storeId: string; activityId: string }>; searchParams: Promise<{ rascunho?: string }>;
}) {
  const { storeId, activityId } = await params;
  const { rascunho } = await searchParams;
  return <StoreWorkspace storeId={storeId} section="activities" activityRoute={{ view: 'register', activityId, draftId: rascunho }} />;
}
