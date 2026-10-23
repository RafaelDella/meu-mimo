import { Suspense } from 'react';
import { StoreWorkspace } from '@/components/stores/store-workspace';
export default async function FeedPage({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;
  return <Suspense fallback={<p role="status">Abrindo o mural…</p>}><StoreWorkspace storeId={storeId} section="feed" /></Suspense>;
}
