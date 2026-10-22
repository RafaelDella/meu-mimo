import { StoreWorkspace } from '@/components/stores/store-workspace';
export default async function EditRewardPage({ params }: { params: Promise<{ storeId: string; rewardId: string }> }) {
  const { storeId, rewardId } = await params;
  return <StoreWorkspace storeId={storeId} section="rewards" rewardRoute={{ view: 'edit', rewardId }} />;
}
