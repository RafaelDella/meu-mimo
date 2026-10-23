import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { appendSuppression } from './journal.mjs';
import { custodyRoot, withMaintenanceLock } from './custody.mjs';
import { authUserMissing, protocolEvents, recordRightsEvent, rightsProtocol, verifyRightsFixtures,
  withRightsDatabase, withRightsOperator } from './rights-db.mjs';

async function knownBackup() {
  try {
    const entries = await readdir(path.join(custodyRoot, 'backups'), { withFileTypes: true });
    for (const entry of entries) if (entry.isDirectory() && /^[a-f0-9-]{36}$/.test(entry.name)) {
      if ((await readdir(path.join(custodyRoot, 'backups', entry.name))).includes('manifest.json')) return true;
    }
    return false;
  } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

export async function erasureReport(context, protocol) {
  const subject = protocol.subjectProfileId;
  const summary = (await context.database.query(`SELECT
    (SELECT count(*)::int FROM app."MediaAsset" a JOIN app."MediaCollection" c ON c.id=a."collectionId"
      WHERE a."authorProfileId"=$1 AND a."purgedAt" IS NULL AND c."retentionHold") AS held,
    (SELECT count(*)::int FROM app."MediaAsset" WHERE "authorProfileId"=$1 AND "removedAt" IS NOT NULL AND "purgedAt" IS NULL) AS queued,
    (SELECT count(*)::int FROM app."MediaAsset" WHERE "authorProfileId"=$1 AND "purgedAt" IS NOT NULL) AS purged,
    (SELECT count(*)::int FROM app."AuthSession" WHERE "profileId"=$1 AND "revokedAt" IS NULL) AS sessions,
    (SELECT count(*)::int FROM app."DataSuppression" WHERE "subjectProfileId"=$1) AS suppressed,
    (SELECT count(*)::int FROM app."Membership" m JOIN app."Store" s ON s.id=m."storeId"
      WHERE m."profileId"=$1 AND m.role='MERCHANT' AND s.state<>'CLOSED') AS stores,
    (SELECT count(*)::int FROM app."Redemption" r JOIN app."Membership" m ON m.id=r."participantMembershipId"
      WHERE m."profileId"=$1 AND r.status NOT IN ('FULFILLED','CANCELLED')) AS tickets,
    (SELECT count(*)::int FROM app."ActivitySubmission" WHERE "authorProfileId"=$1 AND status IN ('PENDING','CONTESTED')) AS submissions,
    (SELECT count(*)::int FROM (SELECT p."participantMembershipId" FROM app."PointsEntry" p JOIN app."Membership" m
      ON m.id=p."participantMembershipId" WHERE m."profileId"=$1 GROUP BY p."participantMembershipId" HAVING sum(p.amount)<0) debt) AS debts,
    ((SELECT count(*) FROM app."Comment" WHERE "authorProfileId"=$1)
      +(SELECT count(*) FROM app."NoteVersion" WHERE "actorProfileId"=$1)
      +(SELECT count(*) FROM app."SubmissionReviewEvent" WHERE "actorProfileId"=$1)
      +(SELECT count(*) FROM app."RedemptionEvent" WHERE "actorProfileId"=$1)
      +(SELECT count(*) FROM app."ActivitySubmission" WHERE "authorProfileId"=$1)
      +(SELECT count(*) FROM app."ActivityEvent" WHERE "actorProfileId"=$1)
      +(SELECT count(*) FROM app."RewardEvent" WHERE "actorProfileId"=$1)
      +(SELECT count(*) FROM app."AlbumEvent" WHERE "actorProfileId"=$1)
      +(SELECT count(*) FROM app."ReactionEvent" WHERE "actorProfileId"=$1)
      +(SELECT count(*) FROM app."PointsEntry" p JOIN app."Membership" m ON m.id=p."participantMembershipId" WHERE m."profileId"=$1))::int AS records,
    ((SELECT count(*) FROM app."Comment" c JOIN app."Conversation" t ON t.id=c."conversationId"
      JOIN app."Membership" m ON m.id=t."participantMembershipId" WHERE c."authorProfileId"<>$1 AND
      (m."profileId"=$1 OR EXISTS(SELECT 1 FROM app."Membership" own WHERE own."profileId"=$1 AND own.role='MERCHANT' AND own."storeId"=t."storeId")))
      +(SELECT count(*) FROM app."NoteVersion" n JOIN app."Membership" m ON m.id=n."participantMembershipId"
      WHERE n."actorProfileId"<>$1 AND (m."profileId"=$1 OR EXISTS(SELECT 1 FROM app."Membership" own
      WHERE own."profileId"=$1 AND own.role='MERCHANT' AND own."storeId"=n."storeId"))))::int AS shared`, [subject])).rows[0];
  const events = await protocolEvents(context, protocol.id);
  let authAbsent = false;
  try { authAbsent = authUserMissing((await context.auth.auth.admin.getUserById(subject)).error); }
  catch { /* Uma falha externa continua pendente, mesmo havendo evento histórico. */ }
  const authRemoved = authAbsent && events.some(event => event.code === 'AUTH_REMOVED');
  const pending = ['STRUCTURAL_RECORDS_RETAINED'];
  if (summary.records) pending.push('IMMUTABLE_CONTENT_RETAINED');
  if (summary.shared) pending.push('SHARED_REFERENCE_REVIEW');
  if (summary.stores || summary.tickets || summary.submissions || summary.debts || summary.held) pending.push('PENDING_OBLIGATION');
  if (summary.held) pending.push('MEDIA_RETENTION_HOLD');
  if (summary.queued) pending.push('MEDIA_PURGE_PENDING');
  if (!authRemoved) pending.push('AUTH_REMOVAL_PENDING');
  if (summary.sessions || summary.suppressed !== 2) pending.push('SUPPRESSION_PENDING');
  if (await knownBackup()) pending.push('BACKUP_WINDOW_OPEN');
  return { protocolId: protocol.id, status: 'PARTIAL', applied: [
    ...(summary.suppressed === 2 ? ['IDENTITY_SUPPRESSED', 'AUTHORED_CONTENT_SUPPRESSED'] : []),
    ...(events.some(event => event.code === 'SUPPRESSION_APPLIED') ? ['ACCESS_REVOKED', 'UNHELD_MEDIA_QUEUED'] : []),
    ...(authRemoved ? ['AUTH_REMOVED'] : []),
  ], pending, counts: { records: summary.records, sessions: summary.sessions, mediaHeld: summary.held,
    mediaQueued: summary.queued, mediaPurged: summary.purged, pending: pending.length } };
}

export async function applyRights(protocolId, options = {}) {
  return withMaintenanceLock(() => withRightsDatabase(options, async context => {
    const protocol = await rightsProtocol(context, protocolId, 'ERASURE');
    const fixture = await verifyRightsFixtures(context, protocol.subjectProfileId, protocol.operatorProfileId, { allowMissingSubject: true });
    await appendSuppression({ database: context.resources.database, protocolId: protocol.id,
      subjectProfileId: protocol.subjectProfileId, operatorProfileId: protocol.operatorProfileId,
      requestDigest: protocol.requestDigest, verifiedAt: protocol.verifiedAt.toISOString(), createdAt: protocol.createdAt.toISOString() });
    const applied = await withRightsOperator(context.database, async () => {
      for (const scope of ['IDENTITY', 'AUTHORED_CONTENT']) await context.database.query(`INSERT INTO app."DataSuppression"("subjectProfileId",scope,"protocolId")
        VALUES($1,$2,$3) ON CONFLICT("subjectProfileId",scope) DO NOTHING`, [protocol.subjectProfileId, scope, protocol.id]);
      const owners = (await context.database.query(`SELECT DISTINCT "protocolId" FROM app."DataSuppression" WHERE "subjectProfileId"=$1`,
        [protocol.subjectProfileId])).rows;
      if (owners.length !== 1) throw new Error('Supressões anteriores exigem reconciliação operacional.');
      return { owner: owners[0].protocolId, counts: (await context.database.query('SELECT app.apply_data_erasure($1::uuid) AS counts', [owners[0].protocolId])).rows[0].counts };
    });
    if (applied.owner !== protocol.id) await recordRightsEvent(context, protocol.id, 'SUPPRESSION_APPLIED', applied.counts);
    let authRemoved = fixture.subjectMissing;
    if (!authRemoved) {
      try {
        const removed = await context.auth.auth.admin.deleteUser(protocol.subjectProfileId);
        authRemoved = !removed.error || authUserMissing(removed.error);
      } catch { authRemoved = false; }
    }
    if (authRemoved) await recordRightsEvent(context, protocol.id, 'AUTH_REMOVED', { authIdentities: fixture.subjectMissing ? 0 : 1 });
    const report = await erasureReport(context, protocol);
    if (report.counts.mediaPurged) await recordRightsEvent(context, protocol.id, 'MEDIA_PURGED', { mediaPurged: report.counts.mediaPurged });
    await recordRightsEvent(context, protocol.id, 'PARTIAL', { pending: report.pending.length }, { once: false });
    return report;
  }));
}
