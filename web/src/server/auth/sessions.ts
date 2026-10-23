import '../only.ts';
import { getDb } from '../db/client.ts';
import { AppError } from '../errors.ts';
import { suppressionFor } from '../privacy/suppression.ts';

function invalidSession(): never {
  throw new AppError('session_invalid', 401, 'Sua sessão não está disponível. Entre novamente.');
}

export async function ensureProfile(userId: string): Promise<void> {
  if ((await suppressionFor(getDb(), [userId])).get(userId)?.identity) invalidSession();
  const profile = await getDb().profile.upsert({
    where: { id: userId },
    create: { id: userId },
    update: {},
    select: { suspendedAt: true },
  });
  if ((await suppressionFor(getDb(), [userId])).get(userId)?.identity) invalidSession();
  if (profile.suspendedAt) {
    throw new AppError('account_suspended', 403, 'O acesso desta conta está suspenso.');
  }
}

export async function registerAuthSession(
  sessionId: string,
  userId: string,
  recovery = false,
): Promise<void> {
  await ensureProfile(userId);
  const session = await getDb().authSession.upsert({
    where: { id: sessionId },
    create: { id: sessionId, profileId: userId, recovery },
    update: {},
    select: { profileId: true, revokedAt: true, recovery: true },
  });
  if (session.profileId !== userId || session.revokedAt) invalidSession();

  // Registrar novamente nunca remove revogação ou relaxa a recuperação.
  if (recovery && !session.recovery) {
    const changed = await getDb().authSession.updateMany({
      where: { id: sessionId, profileId: userId, revokedAt: null },
      data: { recovery: true },
    });
    if (!changed.count) invalidSession();
  }
}

export async function readAuthSession(
  sessionId: string,
  userId: string,
): Promise<{ recovery: boolean }> {
  const session = await getDb().authSession.findUnique({
    where: { id: sessionId },
    select: {
      profileId: true,
      revokedAt: true,
      recovery: true,
      profile: { select: { suspendedAt: true } },
    },
  });
  if (!session || session.profileId !== userId || session.revokedAt) invalidSession();
  if ((await suppressionFor(getDb(), [userId])).get(userId)?.identity) invalidSession();
  if (session.profile.suspendedAt) {
    throw new AppError('account_suspended', 403, 'O acesso desta conta está suspenso.');
  }
  return { recovery: session.recovery };
}

export async function revokeAuthSession(sessionId: string, userId: string): Promise<void> {
  await getDb().authSession.updateMany({
    where: { id: sessionId, profileId: userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function completeRecoverySession(sessionId: string, userId: string): Promise<void> {
  const session = await readAuthSession(sessionId, userId);
  if (!session.recovery) {
    throw new AppError('recovery_required', 403, 'Abra o link de recuperação para alterar a senha.');
  }
  const changed = await getDb().authSession.updateMany({
    where: { id: sessionId, profileId: userId, revokedAt: null, recovery: true },
    data: { recovery: false },
  });
  if (!changed.count) invalidSession();
}
