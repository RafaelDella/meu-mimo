import { StoreWorkspace } from '@/components/stores/store-workspace';
export default async function RewardsPage({ params, searchParams }: {
  params: Promise<{ storeId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { storeId } = await params; const input = await searchParams; const query = new URLSearchParams();
  for (const key of ['q', 'category', 'state', 'page', 'pageSize']) { const value = input[key]; if (typeof value === 'string' && value) query.set(key, value); }
  return <StoreWorkspace storeId={storeId} section="rewards" rewardRoute={{ view: 'catalog', query: query.toString() }} />;
}
