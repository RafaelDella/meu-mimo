import '../only.ts';
import { createHash } from 'node:crypto';
import type { AdminActionBody } from '../../contracts/admin.ts';
import type { Identity } from '../auth/types.ts';
import type { StoreTransaction } from '../stores/transaction.ts';

export async function commandAdminAction(tx: StoreTransaction, identity: Identity, input: AdminActionBody): Promise<string> {
  const digest = createHash('sha256').update(JSON.stringify({ actorProfileId: identity.userId,
    target: input.target, action: input.action, expectedVersion: input.expectedVersion, reason: input.reason })).digest('hex');
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT app.apply_admin_action(${identity.userId}::uuid,${identity.sessionId}::uuid,${input.operationId}::uuid,
      ${input.target.type}::text,${input.target.id}::uuid,${input.action}::text,
      ${input.expectedVersion}::integer,${input.reason}::text,${digest}::text) AS id`;
  return rows[0].id;
}
