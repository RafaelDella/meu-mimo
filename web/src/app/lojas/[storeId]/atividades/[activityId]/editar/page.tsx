import { StoreWorkspace } from '@/components/stores/store-workspace';
export default async function EditActivityPage({ params }: { params: Promise<{ storeId: string; activityId: string }> }) {
  const { storeId, activityId } = await params;
  return <StoreWorkspace storeId={storeId} section="activities" activityRoute={{ view: 'edit', activityId }} />;
}
