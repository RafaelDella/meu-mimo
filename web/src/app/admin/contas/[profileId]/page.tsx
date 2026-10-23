import { AdminScreen } from '@/components/admin/admin-screen';
export default async function AdminAccountPage({ params }: { params: Promise<{ profileId: string }> }) {
  const { profileId } = await params; return <AdminScreen section="accounts" target={{ type: 'ACCOUNT', id: profileId }} />;
}
