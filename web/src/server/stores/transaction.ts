import '../only.ts';
import type { Membership, Prisma, Store } from '../../generated/prisma/client.ts';
import type { Identity } from '../auth/types.ts';
import { getDb } from '../db/client.ts';
import { AppError } from '../errors.ts';
import { resourceId, unavailable } from './validation.ts';

export type StoreTransaction = Prisma.TransactionClient;
export type StoreScope = {
  tx: StoreTransaction; identity: Identity; store: Store; membership: Membership | null;
};
export type StoreAuditAction = 'store.created' | 'store.updated' | 'store.paused' | 'store.resumed' | 'store.closed'
  | 'membership.closed' | 'invitation.created' | 'invitation.revoked' | 'invitation.accepted';

export async function databaseNow(tx: StoreTransaction): Promise<Date> {
  const clock = await tx.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`;
  return clock[0].now;
}

export async function assertIdentityInTransaction(tx: StoreTransaction, identity: Identity, updateProfile = false): Promise<void> {
  const profiles = updateProfile
    ? await tx.$queryRaw<{ suspendedAt: Date | null }[]>`
      SELECT "suspendedAt" FROM app."Profile" WHERE id = ${identity.userId}::uuid FOR UPDATE`
    : await tx.$queryRaw<{ suspendedAt: Date | null }[]>`
      SELECT "suspendedAt" FROM app."Profile" WHERE id = ${identity.userId}::uuid FOR SHARE`;
  if (!profiles.length) throw new AppError('session_invalid', 401, 'Entre novamente na sua conta.');
  if (profiles[0].suspendedAt) throw new AppError('account_suspended', 403, 'O acesso desta conta está suspenso.');
  await tx.$queryRaw`
    SELECT id FROM app."AuthSession"
    WHERE id = ${identity.sessionId}::uuid AND "profileId" = ${identity.userId}::uuid FOR SHARE`;
  const session = await tx.authSession.findUnique({ where: { id: identity.sessionId } });
  if (!session || session.profileId !== identity.userId || session.revokedAt) {
    throw new AppError('session_invalid', 401, 'Sua sessão não está disponível. Entre novamente.');
  }
  if (session.recovery) throw new AppError('recovery_required', 403, 'Conclua a recuperação da senha para continuar.');
}

function retryable(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const failure = error as { code?: string; meta?: { code?: string } };
  return failure.code === 'P2034' || (failure.code === 'P2010' && ['40001', '40P01'].includes(failure.meta?.code ?? ''));
}

export async function withIdentityTransaction<T>(
  identity: Identity,
  operation: (tx: StoreTransaction) => Promise<T>,
  options: { updateProfile?: boolean } = {},
): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await getDb().$transaction(async tx => {
        await assertIdentityInTransaction(tx, identity, options.updateProfile);
        return operation(tx);
      }, { maxWait: 5_000, timeout: 10_000 });
    } catch (error) {
      if (attempt >= 2 || !retryable(error)) throw error;
    }
  }
}

/** Ordem de escrita compartilhada: perfil/sessão, loja, vínculo/convite. */
export async function withStoreTransaction<T>(
  identity: Identity,
  storeId: string,
  operation: (scope: StoreScope) => Promise<T>,
): Promise<T> {
  const id = resourceId(storeId);
  return withIdentityTransaction(identity, async tx => {
    await tx.$queryRaw`SELECT id FROM app."Store" WHERE id = ${id}::uuid FOR UPDATE`;
    const store = await tx.store.findUnique({ where: { id } });
    if (!store) unavailable();
    const membership = await tx.membership.findUnique({
      where: { storeId_profileId: { storeId: id, profileId: identity.userId } },
    });
    if (membership) {
      await tx.$queryRaw`SELECT id FROM app."Membership" WHERE id = ${membership.id}::uuid FOR UPDATE`;
    }
    const current = membership ? await tx.membership.findUnique({ where: { id: membership.id } }) : null;
    return operation({ tx, identity, store, membership: current });
  });
}

export function requireMembership(scope: StoreScope): Membership {
  if (!scope.membership || scope.membership.accessRevokedAt) unavailable();
  return scope.membership;
}

export function requireMerchant(scope: StoreScope): Membership {
  const membership = requireMembership(scope);
  if (membership.role !== 'MERCHANT' || membership.closedAt) unavailable();
  return membership;
}

export function assertStoreWritable(scope: StoreScope, allowPaused = false): void {
  const membership = requireMembership(scope);
  if (membership.closedAt) throw new AppError('membership_closed', 409, 'Esta participação foi encerrada. O histórico continua disponível.');
  if (scope.store.state === 'CLOSED') throw new AppError('store_closed', 409, 'Esta lojinha foi encerrada. O histórico continua disponível.');
  if (!allowPaused && scope.store.state === 'PAUSED') throw new AppError('store_paused', 409, 'Esta lojinha está pausada. Aguarde a retomada.');
}

export async function storeAudit(scope: Pick<StoreScope, 'tx' | 'identity' | 'store'>, action: StoreAuditAction, targetId?: string): Promise<void> {
  await scope.tx.storeAudit.create({ data: {
    storeId: scope.store.id, actorProfileId: scope.identity.userId, action, targetId,
  } });
}
