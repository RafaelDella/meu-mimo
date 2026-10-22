import '../only.ts';
import { periodAt } from '../activities/periods.ts';
import { requireConversationAudience } from '../conversations/access.ts';
import type { StoreScope } from '../stores/transaction.ts';
import { requireMembership } from '../stores/transaction.ts';
import { invalidField, resourceId } from '../stores/validation.ts';

export async function targetParticipant(scope: StoreScope, query: URLSearchParams, optionalForMerchant = false): Promise<string | null> {
  const actor = requireMembership(scope);
  const requested = query.get('membershipId');
  if (requested === null && actor.role === 'MERCHANT') {
    if (optionalForMerchant) return null;
    invalidField();
  }
  return (await requireConversationAudience(scope, requested !== null ? resourceId(requested) : actor.id)).id;
}

/** Resolver pela data local preserva a primeira meia-noite em dias de DST. */
export async function movementRange(scope: StoreScope, from: string | null, to: string | null) {
  async function boundary(date: string, offset: number): Promise<Date> {
    const rows = await scope.tx.$queryRaw<{ instant: Date }[]>`
      SELECT ((${date}::date+${offset}::int)::timestamp AT TIME ZONE ${scope.store.timezone}) AS instant`;
    return (await periodAt(scope.tx, scope.store.timezone, 'DAILY', rows[0].instant)).startsAt!;
  }
  return { ...(from ? { gte: await boundary(from, 0) } : {}), ...(to ? { lt: await boundary(to, 1) } : {}) };
}
