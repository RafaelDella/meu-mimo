import { StoreWorkspace } from '@/components/stores/store-workspace';
export default async function SubmissionPage({ params }: { params: Promise<{ storeId: string; submissionId: string }> }) {
  const { storeId, submissionId } = await params;
  return <StoreWorkspace storeId={storeId} section="activities" activityRoute={{ view: 'submission', submissionId }} />;
}
