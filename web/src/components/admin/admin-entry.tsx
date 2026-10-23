'use client';

import Link from 'next/link';
import { StoreRequestError, useResource } from '@/components/stores/store-api';

function destination() {
  if (typeof window === 'undefined') return '/admin';
  const value = new URL(window.location.href).searchParams.get('returnTo');
  if (!value || !/^\/admin(?:\/(?:contas|lojas)(?:\/[0-9a-f-]{36})?)?(?:\?operacao=[0-9a-f-]{36})?$/i.test(value)) return '/admin';
  return value;
}
export function AdminEntry() {
  const resource = useResource<{ actorUserId: string; assuranceLevel: 'aal2' }>('/api/admin/session');
  if (resource.data?.assuranceLevel === 'aal2') return <p><Link className="stores-link" href={destination()}>Abrir administração</Link></p>;
  if (resource.error instanceof StoreRequestError && resource.error.code === 'mfa_required') return <p>O acesso administrativo exige a confirmação do segundo fator abaixo. Depois da confirmação, você poderá abrir a administração.</p>;
  return null;
}
