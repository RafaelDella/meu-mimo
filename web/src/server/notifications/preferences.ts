import '../only.ts';
import type { NotificationPreferences, PreferencesMutation } from '../../contracts/notifications.ts';
import type { NotificationPreference, NotificationPreferenceEvent } from '../../generated/prisma/client.ts';
import type { Identity } from '../auth/types.ts';
import { digest } from '../activities/validation.ts';
import { AppError } from '../errors.ts';
import { consumeStoreLimit } from '../stores/limits.ts';
import type { StoreScope } from '../stores/transaction.ts';
import { databaseNow, requireMembership, withStoreTransaction } from '../stores/transaction.ts';
import { allowedFields, invalidField, operationConflict, operationId, resourceId, unavailable } from '../stores/validation.ts';

function view(storeId: string, preference: NotificationPreference | null): NotificationPreferences {
  return { storeId, version: preference?.version ?? 0, socialMuted: preference?.socialMuted ?? false,
    automaticApprovalNotices: preference?.automaticApprovalNotices ?? true };
}
async function current(scope: StoreScope): Promise<NotificationPreferences> {
  const membership = requireMembership(scope);
  return view(scope.store.id, await scope.tx.notificationPreference.findUnique({ where: { membershipId: membership.id } }));
}
async function mutation(scope: StoreScope, event: NotificationPreferenceEvent): Promise<PreferencesMutation> {
  return { preferences: await current(scope), appliedVersion: event.version };
}

export async function readNotificationPreferences(identity: Identity, storeId: string): Promise<NotificationPreferences> {
  await consumeStoreLimit(identity, 'read');
  return withStoreTransaction(identity, storeId, current);
}

export async function updateNotificationPreferences(identity: Identity, storeId: string, body: Record<string, unknown>): Promise<PreferencesMutation> {
  allowedFields(body, ['operationId', 'expectedVersion', 'socialMuted', 'automaticApprovalNotices']);
  const id = operationId(body); const expectedVersion = body.expectedVersion;
  if (typeof expectedVersion !== 'number' || !Number.isInteger(expectedVersion) || expectedVersion < 0 || expectedVersion >= 2_147_483_647 ||
      typeof body.socialMuted !== 'boolean' || typeof body.automaticApprovalNotices !== 'boolean') invalidField();
  const fields = { socialMuted: body.socialMuted, automaticApprovalNotices: body.automaticApprovalNotices };
  const requestDigest = digest({ expectedVersion, ...fields });
  await consumeStoreLimit(identity, 'write');
  return withStoreTransaction(identity, storeId, async scope => {
    const membership = requireMembership(scope);
    const key = `meumimo:t12:preference-operation:${id}`;
    await scope.tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${key},0))`;
    const existing = await scope.tx.notificationPreferenceEvent.findUnique({ where: { id } });
    if (existing) {
      if (existing.storeId !== scope.store.id || existing.membershipId !== membership.id ||
          existing.actorProfileId !== identity.userId || existing.requestDigest !== requestDigest) operationConflict();
      return mutation(scope, existing);
    }
    const previous = await current(scope);
    if (previous.version !== expectedVersion) throw new AppError('preference_changed', 409, 'Suas preferências mudaram. Atualize e revise antes de salvar.');
    const version = previous.version + 1;
    if (previous.version === 0) await scope.tx.notificationPreference.create({
      data: { membershipId: membership.id, storeId: scope.store.id, version, ...fields },
    });
    else await scope.tx.notificationPreference.update({ where: { membershipId: membership.id }, data: { version, ...fields } });
    const event = await scope.tx.notificationPreferenceEvent.create({ data: { id, membershipId: membership.id,
      storeId: scope.store.id, actorProfileId: identity.userId, version, requestDigest, ...fields, createdAt: await databaseNow(scope.tx) } });
    return mutation(scope, event);
  });
}

export async function lookupPreferenceOperation(identity: Identity, storeId: string, operation: string): Promise<{ operation: PreferencesMutation | null }> {
  const id = resourceId(operation);
  await consumeStoreLimit(identity, 'read');
  return withStoreTransaction(identity, storeId, async scope => {
    const membership = requireMembership(scope);
    const event = await scope.tx.notificationPreferenceEvent.findUnique({ where: { id } });
    if (!event) return { operation: null };
    if (event.storeId !== scope.store.id || event.membershipId !== membership.id || event.actorProfileId !== identity.userId) unavailable();
    return { operation: await mutation(scope, event) };
  });
}
