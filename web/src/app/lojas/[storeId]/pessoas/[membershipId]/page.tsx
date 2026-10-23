import { StoreWorkspace } from '@/components/stores/store-workspace';
export default async function PersonPage({ params }: { params: Promise<{ storeId: string; membershipId: string }> }) {
  const { storeId, membershipId } = await params;
  return <StoreWorkspace storeId={storeId} membershipId={membershipId} section="person" />;
}
