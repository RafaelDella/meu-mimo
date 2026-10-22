import '../only.ts';
import { AppError } from '../errors.ts';
import { createAuthClient } from './client.ts';
import type { AuthClient } from './client.ts';
import type { Identity } from './types.ts';
import { readAuthSession } from './sessions.ts';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function readVerifiedIdentity(client: AuthClient): Promise<Identity> {
  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError || !userData.user) {
    const missing = userError?.name === 'AuthSessionMissingError';
    throw new AppError(missing ? 'identity_missing' : 'session_invalid', 401,
      'Entre na sua conta para continuar.');
  }
  const { data, error } = await client.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims || claims.sub !== userData.user.id || !uuid.test(claims.sub) ||
      !uuid.test(claims.session_id) || !Number.isFinite(claims.exp) ||
      claims.exp <= Date.now() / 1000 || !['aal1', 'aal2'].includes(claims.aal)) {
    throw new AppError('session_invalid', 401, 'Entre na sua conta para continuar.');
  }
  if (!userData.user.email_confirmed_at) {
    throw new AppError('email_unverified', 403, 'Confirme seu e-mail para continuar.');
  }
  return {
    userId: claims.sub,
    sessionId: claims.session_id,
    assuranceLevel: claims.aal === 'aal2' ? 'aal2' : 'aal1',
  };
}

export async function requireIdentity(options: { allowRecovery?: boolean } = {}): Promise<Identity> {
  const identity = await readVerifiedIdentity(await createAuthClient());
  const session = await readAuthSession(identity.sessionId, identity.userId);
  if (session.recovery && !options.allowRecovery) {
    throw new AppError('recovery_required', 403, 'Defina sua nova senha antes de continuar.');
  }
  return identity;
}

export async function currentSession() {
  const identity = await requireIdentity({ allowRecovery: true });
  const session = await readAuthSession(identity.sessionId, identity.userId);
  return { ...identity, recovery: session.recovery };
}
