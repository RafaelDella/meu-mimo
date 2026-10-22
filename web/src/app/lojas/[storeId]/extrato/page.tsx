import { StoreWorkspace } from '@/components/stores/store-workspace';

export default async function StatementPage({ params, searchParams }: {
  params: Promise<{ storeId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { storeId } = await params;
  const input = await searchParams;
  const query = new URLSearchParams();
  for (const key of ['kind', 'from', 'to', 'membershipId', 'page', 'pageSize']) {
    const value = input[key]; if (typeof value === 'string' && value) query.set(key, value);
  }
  return <StoreWorkspace storeId={storeId} section="statement" activityRoute={{ view: 'statement', query: query.toString() }} />;
}
