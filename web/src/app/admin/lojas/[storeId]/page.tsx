import { AdminScreen } from '@/components/admin/admin-screen';
export default async function AdminStorePage({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params; return <AdminScreen section="stores" target={{ type: 'STORE', id: storeId }} />;
}
