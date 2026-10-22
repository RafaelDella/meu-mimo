import '../only.ts';
import { getDb } from '../db/client.ts';

export async function auditEvent(action: string, actorProfileId?: string): Promise<void> {
  await getDb().securityAudit.create({ data: { action, actorProfileId } });
}
