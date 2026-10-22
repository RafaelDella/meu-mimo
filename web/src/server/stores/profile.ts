import '../only.ts';
import type { ProfileView } from '../../contracts/stores.ts';
import type { Identity } from '../auth/types.ts';
import { createAuthClient } from '../auth/client.ts';
import { AppError } from '../errors.ts';
import { consumeStoreLimit } from './limits.ts';
import { withIdentityTransaction } from './transaction.ts';
import { allowedFields, invalidField, textField, unavailable } from './validation.ts';

async function ownEmail(identity: Identity): Promise<string> {
  const { data, error } = await (await createAuthClient()).auth.getUser();
  if (error || data.user?.id !== identity.userId || typeof data.user.email !== 'string') {
    throw new AppError('session_invalid', 401, 'Entre novamente na sua conta.');
  }
  return data.user.email;
}

export async function readProfile(identity: Identity): Promise<ProfileView> {
  await consumeStoreLimit(identity, 'read');
  const email = await ownEmail(identity);
  return withIdentityTransaction(identity, async tx => {
    const profile = await tx.profile.findUnique({ where: { id: identity.userId }, select: { id: true, displayName: true } });
    if (!profile) unavailable();
    return { ...profile, email };
  });
}

export async function updateProfile(identity: Identity, body: Record<string, unknown>): Promise<ProfileView> {
  allowedFields(body, ['displayName']);
  if (typeof body.displayName !== 'string') invalidField();
  const displayName = textField(body, 'displayName', 80, true) || null;
  await consumeStoreLimit(identity, 'write');
  const email = await ownEmail(identity);
  return withIdentityTransaction(identity, async tx => ({
    ...await tx.profile.update({
      where: { id: identity.userId }, data: { displayName }, select: { id: true, displayName: true },
    }), email,
  }), { updateProfile: true });
}
