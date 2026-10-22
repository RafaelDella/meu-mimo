import { StoreWorkspace } from '@/components/stores/store-workspace';
export default async function InvitationsPage({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;
  return <StoreWorkspace storeId={storeId} section="invitations" />;
}
