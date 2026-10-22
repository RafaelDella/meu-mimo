import '../only.ts';
import { getDb } from '../db/client.ts';
import { readAuthSession } from '../auth/sessions.ts';
import type { Identity } from '../auth/types.ts';
import { AppError } from '../errors.ts';
import type { AdminContext } from './types.ts';

export async function requireAdminAccess(identity: Identity): Promise<AdminContext> {
  const session = await readAuthSession(identity.sessionId, identity.userId);
  if (session.recovery) {
    throw new AppError('recovery_required', 403, 'Conclua a recuperação da senha para continuar.');
  }
  const grant = await getDb().adminGrant.findUnique({
    where: { profileId: identity.userId },
    select: { revokedAt: true },
  });
  if (!grant || grant.revokedAt) {
    throw new AppError('admin_forbidden', 403, 'Acesso administrativo não permitido.');
  }
  if (identity.assuranceLevel !== 'aal2') {
    throw new AppError('mfa_required', 403, 'Confirme o segundo fator para acessar a administração.');
  }
  return { actorUserId: identity.userId, assuranceLevel: 'aal2' };
}
