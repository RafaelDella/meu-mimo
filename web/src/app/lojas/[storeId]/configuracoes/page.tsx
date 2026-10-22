import { StoreWorkspace } from '@/components/stores/store-workspace';
export default async function SettingsPage({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;
  return <StoreWorkspace storeId={storeId} section="settings" />;
}
