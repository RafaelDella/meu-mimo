import { InvitationScreen } from '@/components/stores/invitation-screen';
export default async function InvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <InvitationScreen key={token} token={token} />;
}
