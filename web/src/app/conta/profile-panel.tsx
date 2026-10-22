'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import type { ProfileView } from '@/contracts/stores';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Feedback } from '@/components/stores/store-controls';
import { storeError, storeRequest, useResource, useStoreAction } from '@/components/stores/store-api';

function ProfileForm({ profile }: { profile: ProfileView }) {
  const [name, setName] = useState(profile.displayName ?? '');
  const action = useStoreAction();
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const displayName = name.trim();
    void action.run(async signal => {
      try { return await storeRequest<ProfileView>('/api/perfil', 'PATCH', { displayName }, signal); }
      catch (cause) {
        if (signal.aborted) throw cause;
        const current = await storeRequest<ProfileView>('/api/perfil', 'GET', undefined, signal);
        if ((current.displayName ?? '') === displayName) return current;
        throw cause;
      }
    }, value => { setName(value.displayName ?? ''); action.setMessage('Seu nome foi salvo.'); });
  }
  return <section className="account-profile" aria-labelledby="profile-title"><h3 id="profile-title">Como você quer aparecer?</h3>
    <p>Este nome identifica você nas suas lojas e nos convites.</p><Feedback {...action} />
    <form className="account-form" onSubmit={save}><Input label="E-mail da sua conta" type="email" value={profile.email} readOnly />
      <Input label="Seu nome" name="displayName" autoComplete="name" maxLength={80} value={name}
      onChange={event => setName(event.target.value)} disabled={action.busy} /><Button type="submit" disabled={action.busy}>Salvar nome</Button></form>
  </section>;
}

export function ProfilePanel() {
  const profile = useResource<ProfileView>('/api/perfil');
  if (profile.loading) return <p role="status">Buscando seu perfil…</p>;
  if (profile.error || !profile.data) return <div><p className="account-error" role="alert">{storeError(profile.error)}</p><Button variant="secondary" onClick={profile.reload}>Consultar perfil novamente</Button></div>;
  return <ProfileForm key={profile.data.id} profile={profile.data} />;
}
