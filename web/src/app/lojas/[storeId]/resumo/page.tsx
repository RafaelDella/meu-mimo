import { Suspense } from 'react';
import { StoreWorkspace } from '@/components/stores/store-workspace';
export default async function SummaryPage({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;
  return <Suspense fallback={<p role="status">Abrindo o resumo…</p>}><StoreWorkspace storeId={storeId} section="home" /></Suspense>;
}
