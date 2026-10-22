import { StoreWorkspace } from '@/components/stores/store-workspace';
export default async function RewardPage({ params, searchParams }: {
  params: Promise<{ storeId: string; rewardId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { storeId, rewardId } = await params; const query = await searchParams;
  const operationId = typeof query.operacao === 'string' && /^[0-9a-f-]{36}$/i.test(query.operacao) ? query.operacao : undefined;
  return <StoreWorkspace storeId={storeId} section="rewards" rewardRoute={{ view: 'detail', rewardId, operationId }} />;
}
