import { rightsError } from './rights-db.mjs';

export const rightsAudience = (store, participant) => `EXISTS(SELECT 1 FROM app."Membership" audience
  WHERE audience.id=${participant} AND audience."storeId"=${store} AND audience.role='PARTICIPANT' AND audience."accessRevokedAt" IS NULL)
  AND EXISTS(SELECT 1 FROM app."Membership" own
  WHERE own."profileId"=$1 AND own."storeId"=${store} AND own."accessRevokedAt" IS NULL
  AND (own.role='MERCHANT' OR own.id=${participant}))`;
const storeAudience = store => `EXISTS(SELECT 1 FROM app."Membership" own WHERE own."profileId"=$1
  AND own."storeId"=${store} AND own."accessRevokedAt" IS NULL)`;

// Projeções explícitas: tokens, digests, credenciais e diagnósticos não entram no pacote.
const definitions = [
  ['Profile', `SELECT p.id::text AS _cursor,p.id,p."displayName",p."createdAt" FROM app."Profile" p WHERE p.id=$1`, { displayName: 'id' }],
  ['Membership', `SELECT m.id::text AS _cursor,m.id,m."storeId",m."profileId",m.role,m."createdAt",m."closedAt",m."accessRevokedAt"
    FROM app."Membership" m WHERE m."profileId"=$1`, {}],
  ['Invitation', `SELECT i.id::text AS _cursor,i.id,i."storeId",i."createdByProfileId",i."createdAt",i."expiresAt",i."revokedAt",i."acceptedAt",
    i."acceptedByProfileId",i."acceptedMembershipId",i.kind,i."maxUses",
    CASE WHEN i."createdByProfileId"=$1 THEN i."useCount" END AS "useCount"
    FROM app."Invitation" i WHERE i."createdByProfileId"=$1 OR i."acceptedByProfileId"=$1
    OR EXISTS(SELECT 1 FROM app."InvitationUse" own WHERE own."invitationId"=i.id AND own."profileId"=$1)`, {}],
  ['InvitationUse', `SELECT u.id::text AS _cursor,u.id,u."invitationId",u."storeId",u."profileId",u."membershipId",u."createdAt"
    FROM app."InvitationUse" u WHERE u."profileId"=$1 OR EXISTS(SELECT 1 FROM app."Membership" owner
      WHERE owner."profileId"=$1 AND owner."storeId"=u."storeId" AND owner.role='MERCHANT' AND owner."accessRevokedAt" IS NULL)`, {}],
  ['AdminGrant', `SELECT g."profileId"::text AS _cursor,g."profileId",g."grantedAt",g."revokedAt" FROM app."AdminGrant" g WHERE g."profileId"=$1`, {}],
  ['Store', `SELECT s.id::text AS _cursor,s.id,s."createdByProfileId",s.name,s.presentation,s.timezone,s.state,s."createdAt",s."closedAt"
    FROM app."Store" s WHERE ${storeAudience('s.id')}`, { name: 'createdByProfileId', presentation: 'createdByProfileId' }],
  ['Activity', `SELECT a.id::text AS _cursor,a.id,a."storeId",a."createdByProfileId",a.name,a.description,a.category,a.sticker,a.points,
    a.frequency,a."weeklyLimit",a."approvalMode",a.version,a."createdAt",a."archivedAt" FROM app."Activity" a
    WHERE ${storeAudience('a."storeId"')}`, { name: 'createdByProfileId', description: 'createdByProfileId', category: 'createdByProfileId', sticker: 'createdByProfileId' }],
  ['ActivityEvent', `SELECT e.id::text AS _cursor,e.id,e."activityId",e."storeId",e."actorProfileId",e.version,e.kind,e."createdAt",
    e.configuration FROM app."ActivityEvent" e WHERE e."actorProfileId"=$1 AND ${storeAudience('e."storeId"')}`, { configuration: 'actorProfileId' }],
  ['ActivitySubmission', `SELECT s.id::text AS _cursor,s.id,s."storeId",s."activityId",s."participantMembershipId",s."authorProfileId",s.status,
    s."createdAt",s."receivedAt",s."approvedAt",s."activityName",s."activityDescription",s."activityCategory",s."activitySticker",s.points,
    s.frequency,s.caption,s."localDate",s."evidenceAssetId",a."createdByProfileId" AS "_activityAuthor"
    FROM app."ActivitySubmission" s JOIN app."Activity" a ON a.id=s."activityId"
    WHERE ${rightsAudience('s."storeId"', 's."participantMembershipId"')} AND (s.status<>'DRAFT' OR s."authorProfileId"=$1)`,
  { caption: 'authorProfileId', activityName: '_activityAuthor', activityDescription: '_activityAuthor', activityCategory: '_activityAuthor', activitySticker: '_activityAuthor' }],
  ['SubmissionEvent', `SELECT e.id::text AS _cursor,e.id,e."submissionId",e."actorProfileId",e.kind,e."createdAt" FROM app."SubmissionEvent" e
    JOIN app."ActivitySubmission" s ON s.id=e."submissionId" WHERE ${rightsAudience('s."storeId"', 's."participantMembershipId"')}
    AND (s.status<>'DRAFT' OR s."authorProfileId"=$1)`, {}],
  ['SubmissionReviewEvent', `SELECT e.id::text AS _cursor,e.id,e."submissionId",e."actorProfileId",e.version,e.action,e."fromStatus",e."toStatus",
    e.reason,e.text,e.delta,e."evidenceAssetId",e."createdAt" FROM app."SubmissionReviewEvent" e JOIN app."ActivitySubmission" s ON s.id=e."submissionId"
    WHERE ${rightsAudience('s."storeId"', 's."participantMembershipId"')}`, { reason: 'actorProfileId', text: 'actorProfileId' }],
  ['Reward', `SELECT r.id::text AS _cursor,r.id,r."storeId",r."createdByProfileId",r.name,r.description,r.category,r.sticker,r.cost,r.note,r.instructions,
    r.available,r.stock,r.version,r."createdAt",r."archivedAt" FROM app."Reward" r WHERE ${storeAudience('r."storeId"')}`,
  { name: 'createdByProfileId', description: 'createdByProfileId', category: 'createdByProfileId', sticker: 'createdByProfileId', note: 'createdByProfileId', instructions: 'createdByProfileId' }],
  ['RewardEvent', `SELECT e.id::text AS _cursor,e.id,e."rewardId",e."storeId",e."actorProfileId",e.version,e.kind,e.configuration,e."createdAt"
    FROM app."RewardEvent" e WHERE e."actorProfileId"=$1 AND ${storeAudience('e."storeId"')}`, { configuration: 'actorProfileId' }],
  ['Redemption', `SELECT r.id::text AS _cursor,r.id,r."storeId",r."rewardId",r."participantMembershipId",r."authorProfileId",r.code,r.status,r.version,
    r."rewardName",r."rewardDescription",r."rewardCategory",r."rewardSticker",r."rewardCost",r."rewardNote",r."rewardInstructions",
    r."balanceBefore",r."balanceAfter",r."stockBefore",r."stockAfter",r."agreementDate",r."fulfilledAt",r."cancelledAt",r."createdAt",
    w."createdByProfileId" AS "_rewardAuthor" FROM app."Redemption" r JOIN app."Reward" w ON w.id=r."rewardId"
    WHERE ${rightsAudience('r."storeId"', 'r."participantMembershipId"')}`,
  { rewardName: '_rewardAuthor', rewardDescription: '_rewardAuthor', rewardCategory: '_rewardAuthor', rewardSticker: '_rewardAuthor', rewardNote: '_rewardAuthor', rewardInstructions: '_rewardAuthor' }],
  ['RedemptionEvent', `SELECT e.id::text AS _cursor,e.id,e."redemptionId",e."actorProfileId",e.kind,e.version,e."fromStatus",e."toStatus",e.text,
    e."agreementDate",e.delta,e.restocked,e."stockBefore",e."stockAfter",e."balanceBefore",e."balanceAfter",e."createdAt"
    FROM app."RedemptionEvent" e JOIN app."Redemption" r ON r.id=e."redemptionId"
    WHERE ${rightsAudience('r."storeId"', 'r."participantMembershipId"')}`, { text: 'actorProfileId' }],
  ['PointsEntry', `SELECT p.id::text AS _cursor,p.id,p."storeId",p."participantMembershipId",p."submissionId",p."redemptionId",p."redemptionEventId",
    p."actorProfileId",p.kind,p.amount,p."reviewEventId",p."compensatesEntryId",p."createdAt" FROM app."PointsEntry" p
    WHERE ${rightsAudience('p."storeId"', 'p."participantMembershipId"')}`, {}],
  ['Conversation', `SELECT c.id::text AS _cursor,c.id,c."storeId",c."participantMembershipId",c."subjectType",c."subjectId",c."createdAt"
    FROM app."Conversation" c WHERE ${rightsAudience('c."storeId"', 'c."participantMembershipId"')}`, {}],
  ['Comment', `SELECT c.id::text AS _cursor,c.id,c."conversationId",c."authorProfileId",c.text,c."createdAt" FROM app."Comment" c
    JOIN app."Conversation" t ON t.id=c."conversationId" WHERE ${rightsAudience('t."storeId"', 't."participantMembershipId"')}`, { text: 'authorProfileId' }],
  ['NoteVersion', `SELECT n.id::text AS _cursor,n.id,n."noteId",n."storeId",n."participantMembershipId",n."actorProfileId",n.version,n.text,n."createdAt"
    FROM app."NoteVersion" n WHERE ${rightsAudience('n."storeId"', 'n."participantMembershipId"')}`, { text: 'actorProfileId' }],
  ['PersonalNote', `SELECT n.id::text AS _cursor,n.id,n."storeId",n."participantMembershipId",n.version FROM app."PersonalNote" n
    WHERE ${rightsAudience('n."storeId"', 'n."participantMembershipId"')}`, {}],
  ['NoteRead', `SELECT r."noteVersionId"::text||':'||r."readerMembershipId"::text AS _cursor,r."noteVersionId",r."readerMembershipId",r."actorProfileId",r."readAt"
    FROM app."NoteRead" r WHERE r."actorProfileId"=$1`, {}],
  ['Reaction', `SELECT r.id::text AS _cursor,r.id,r."conversationId",r."actorProfileId",r.version,r.emoji FROM app."Reaction" r
    JOIN app."Conversation" c ON c.id=r."conversationId" WHERE ${rightsAudience('c."storeId"', 'c."participantMembershipId"')}`, { emoji: 'actorProfileId' }],
  ['ReactionEvent', `SELECT r.id::text AS _cursor,r.id,r."reactionId",r."conversationId",r."actorProfileId",r.version,r."fromEmoji",r."toEmoji",r."createdAt"
    FROM app."ReactionEvent" r JOIN app."Conversation" c ON c.id=r."conversationId"
    WHERE ${rightsAudience('c."storeId"', 'c."participantMembershipId"')}`, { fromEmoji: 'actorProfileId', toEmoji: 'actorProfileId' }],
  ['AlbumItem', `SELECT i."assetId"::text AS _cursor,i."assetId",i."albumId",i."publicationId",i.position,i.caption,i."createdAt",
    a."authorProfileId" AS "_author" FROM app."AlbumItem" i JOIN app."TicketAlbum" t ON t.id=i."albumId"
    JOIN app."MediaCollection" c ON c.id=t."collectionId" JOIN app."MediaAsset" a ON a.id=i."assetId" AND a."collectionId"=c.id
    JOIN app."Redemption" r ON r.id=t."redemptionId" JOIN app."Store" store ON store.id=t."storeId"
    JOIN app."Membership" participant ON participant.id=t."participantMembershipId"
    JOIN app."AlbumEvent" publication ON publication.id=i."publicationId" AND publication."albumId"=t.id
    WHERE ${rightsAudience('t."storeId"', 't."participantMembershipId"')}
    AND c.purpose='MEMORY' AND c."subjectId"=r.id AND c."storeId"=t."storeId" AND c."participantMembershipId"=t."participantMembershipId"
    AND r."storeId"=t."storeId" AND r."participantMembershipId"=t."participantMembershipId" AND publication.kind='PUBLISH'
    AND EXISTS(SELECT 1 FROM app."Membership" merchant WHERE merchant."storeId"=t."storeId" AND merchant.role='MERCHANT'
      AND merchant."profileId"=t."createdByProfileId" AND merchant."accessRevokedAt" IS NULL)
    AND a.state='READY' AND a."removedAt" IS NULL AND a."purgedAt" IS NULL AND a."publishedAt" IS NOT NULL
    AND NOT EXISTS(SELECT 1 FROM app."DataSuppression" s WHERE s."subjectProfileId"=a."authorProfileId" AND s.scope IN ('IDENTITY','AUTHORED_CONTENT'))
    AND NOT EXISTS(SELECT 1 FROM app."DataSuppression" s WHERE s."subjectProfileId"=publication."actorProfileId" AND s.scope='AUTHORED_CONTENT')
    AND (r.status NOT IN ('FULFILLED','CANCELLED') OR
      ((LEAST(store."closedAt",participant."closedAt") IS NULL OR LEAST(store."closedAt",participant."closedAt")+interval '1 year'>clock_timestamp())
       AND (c."retentionUntil" IS NULL OR c."retentionUntil">clock_timestamp())))`, { caption: '_author' }],
  ['AlbumEvent', `SELECT e.id::text AS _cursor,e.id,e."albumId",e."redemptionId",e."actorProfileId",e.version,e.kind,e."removedAssetId",e."createdAt"
    FROM app."AlbumEvent" e JOIN app."TicketAlbum" t ON t.id=e."albumId"
    WHERE ${rightsAudience('t."storeId"', 't."participantMembershipId"')}`, {}],
  ['TicketAlbum', `SELECT a.id::text AS _cursor,a.id,a."storeId",a."redemptionId",a."participantMembershipId",a."createdByProfileId",a.version,a."createdAt"
    FROM app."TicketAlbum" a WHERE ${rightsAudience('a."storeId"', 'a."participantMembershipId"')}`, {}],
  ['MediaAsset', `SELECT a.id::text AS _cursor,a.id,a."authorProfileId",a."mediaType",a."mimeType",a."byteLength",a.state,a."publishedAt",a."removedAt",a."purgedAt",a."createdAt"
    FROM app."MediaAsset" a JOIN app."MediaCollection" c ON c.id=a."collectionId"
    WHERE ${rightsAudience('c."storeId"', 'c."participantMembershipId"')} AND (a."authorProfileId"=$1 OR
      (a."publishedAt" IS NOT NULL AND a."removedAt" IS NULL AND (c."retentionUntil" IS NULL OR c."retentionUntil">clock_timestamp())
       AND NOT EXISTS(SELECT 1 FROM app."DataSuppression" s WHERE s."subjectProfileId"=a."authorProfileId" AND s.scope IN ('IDENTITY','AUTHORED_CONTENT'))))`, {}],
  ['Notification', `SELECT n.id::text AS _cursor,n.id,n."createdAt",n."readAt",e.kind,e."storeId",e."participantMembershipId",e."actorProfileId"
    FROM app."Notification" n JOIN app."OutboxEvent" e ON e.id=n."eventId" JOIN app."Membership" m ON m.id=e."recipientMembershipId"
    WHERE m."profileId"=$1 AND m."accessRevokedAt" IS NULL`, {}],
  ['NotificationPreference', `SELECT p."membershipId"::text AS _cursor,p."membershipId",p."socialMuted",p."automaticApprovalNotices",p.version
    FROM app."NotificationPreference" p JOIN app."Membership" m ON m.id=p."membershipId" WHERE m."profileId"=$1`, {}],
  ['NotificationPreferenceEvent', `SELECT e.id::text AS _cursor,e.id,e."membershipId",e."actorProfileId",e.version,e."socialMuted",e."automaticApprovalNotices",e."createdAt"
    FROM app."NotificationPreferenceEvent" e WHERE e."actorProfileId"=$1`, {}],
  ['NotificationGroup', `SELECT g.id::text AS _cursor,g.id,g."storeId",g."recipientMembershipId",g."actorProfileId",g.category,g.version,g."lastDeliveredAt"
    FROM app."NotificationGroup" g JOIN app."Membership" m ON m.id=g."recipientMembershipId" WHERE m."profileId"=$1 AND m."accessRevokedAt" IS NULL`, {}],
  ['StoreAudit', `SELECT a.id::text AS _cursor,a.id,a."storeId",a."actorProfileId",a.action,a."targetId",a."createdAt" FROM app."StoreAudit" a
    WHERE a."actorProfileId"=$1`, {}],
  ['AdminAction', `SELECT a.id::text AS _cursor,a.id,a."actorProfileId",a."targetProfileId",a."targetStoreId",a.kind,a.version,a."createdAt"
    FROM app."AdminAction" a WHERE a."actorProfileId"=$1 OR a."targetProfileId"=$1`, {}],
  ['DataRightsProtocol', `SELECT p.id::text AS _cursor,p.id,p."subjectProfileId",p."operatorProfileId",p.kind,p."verifiedAt",p."createdAt",p."expiresAt"
    FROM app."DataRightsProtocol" p WHERE p."subjectProfileId"=$1`, {}],
  ['DataRightsEvent', `SELECT e.id::text AS _cursor,e.id,e."protocolId",e.sequence,e.code,e."createdAt",e."countsJson" FROM app."DataRightsEvent" e
    JOIN app."DataRightsProtocol" p ON p.id=e."protocolId" WHERE p."subjectProfileId"=$1`, {}],
];

async function redactPage(database, rows, authors) {
  const ids = [...new Set(rows.flatMap(row => Object.values(authors).map(field => row[field])).filter(Boolean))];
  const suppressions = ids.length ? (await database.query(`SELECT "subjectProfileId",scope FROM app."DataSuppression" WHERE "subjectProfileId"=ANY($1::uuid[])`, [ids])).rows : [];
  return rows.map(row => {
    const output = Object.fromEntries(Object.entries(row).filter(([key]) => !key.startsWith('_')));
    if (Object.hasOwn(output, 'configuration')) {
      const allowed = ['name', 'description', 'category', 'sticker', 'points', 'frequency', 'weeklyLimit', 'approvalMode',
        'cost', 'note', 'instructions', 'available', 'stock', 'stockRevision'];
      output.configuration = Object.fromEntries(Object.entries(output.configuration ?? {}).filter(([key, value]) =>
        allowed.includes(key) && (value === null || ['string', 'number', 'boolean'].includes(typeof value))));
    }
    for (const [field, author] of Object.entries(authors)) {
      const suppressed = suppressions.some(item => item.subjectProfileId === row[author] && item.scope === (field === 'displayName' ? 'IDENTITY' : 'AUTHORED_CONTENT'));
      if (!suppressed) continue;
      if (field === 'configuration') output[field] = Object.fromEntries(Object.entries(output[field] ?? {}).map(([key, value]) =>
        [key, typeof value === 'string' ? '[Conteúdo removido]' : value]));
      else output[field] = ['emoji', 'fromEmoji', 'toEmoji'].includes(field) ? null : field === 'displayName' ? 'Conta removida' : '[Conteúdo removido]';
    }
    return output;
  });
}

export async function* exportRecordPages(context, subjectId) {
  for (const [type, sql, authors] of definitions) {
    let cursor = '';
    for (;;) {
      const rows = (await context.database.query(`SELECT * FROM (${sql}) selected WHERE _cursor>$2 ORDER BY _cursor LIMIT 100`, [subjectId, cursor])).rows;
      if (!rows.length) break;
      cursor = rows.at(-1)._cursor;
      yield { type, rows: await redactPage(context.database, rows, authors) };
      if (rows.length < 100) break;
    }
  }
}

export async function exportFingerprint(database, subjectId) {
  const own = (await database.query('SELECT scope FROM app."DataSuppression" WHERE "subjectProfileId"=$1', [subjectId])).rows;
  if (own.length) throw rightsError();
  return (await database.query(`SELECT md5(jsonb_build_object(
    'profile',(SELECT jsonb_build_array("suspendedAt","securityVersion") FROM app."Profile" WHERE id=$1),
    'memberships',(SELECT jsonb_agg(jsonb_build_array(id,"storeId",role,"closedAt","accessRevokedAt") ORDER BY id) FROM app."Membership" WHERE "profileId"=$1),
    'invitationUses',(SELECT jsonb_agg(jsonb_build_array(u.id,u."invitationId",u."membershipId",u."createdAt") ORDER BY u.id)
      FROM app."InvitationUse" u WHERE u."profileId"=$1 OR EXISTS(SELECT 1 FROM app."Membership" owner
        WHERE owner."profileId"=$1 AND owner."storeId"=u."storeId" AND owner.role='MERCHANT' AND owner."accessRevokedAt" IS NULL)),
    'invitations',(SELECT jsonb_agg(jsonb_build_array(i.id,i."expiresAt",i."maxUses",i."revokedAt",i."useCount") ORDER BY i.id)
      FROM app."Invitation" i WHERE i."createdByProfileId"=$1 OR i."acceptedByProfileId"=$1
        OR EXISTS(SELECT 1 FROM app."InvitationUse" u WHERE u."invitationId"=i.id AND u."profileId"=$1)),
    'audiences',(SELECT jsonb_agg(jsonb_build_array(m.id,m."storeId",m.role,m."closedAt",m."accessRevokedAt") ORDER BY m.id)
      FROM app."Membership" m WHERE ${storeAudience('m."storeId"')}),
    'origins',(SELECT jsonb_agg(jsonb_build_array(t.id,r.status,store."closedAt",participant."closedAt",
      LEAST(store."closedAt",participant."closedAt") IS NULL OR LEAST(store."closedAt",participant."closedAt")+interval '1 year'>clock_timestamp()) ORDER BY t.id)
      FROM app."TicketAlbum" t JOIN app."Redemption" r ON r.id=t."redemptionId" JOIN app."Store" store ON store.id=t."storeId"
      JOIN app."Membership" participant ON participant.id=t."participantMembershipId" WHERE ${rightsAudience('t."storeId"', 't."participantMembershipId"')}),
    'suppression',(SELECT jsonb_agg(jsonb_build_array("subjectProfileId",scope,"createdAt") ORDER BY "subjectProfileId",scope) FROM app."DataSuppression"),
    'media',(SELECT jsonb_agg(jsonb_build_array(a.id,a.state,a."removedAt",a."purgedAt",a."publishedAt",a."outputVersion",c."retentionHold",c."retentionUntil",
      c."retentionUntil" IS NULL OR c."retentionUntil">clock_timestamp(),c.purpose<>'EVIDENCE' OR a."publishedAt" IS NULL OR a."publishedAt">clock_timestamp()-interval '180 days') ORDER BY a.id)
      FROM app."MediaAsset" a JOIN app."MediaCollection" c ON c.id=a."collectionId" WHERE ${rightsAudience('c."storeId"', 'c."participantMembershipId"')})
    )::text) AS fingerprint`, [subjectId])).rows[0].fingerprint;
}

export async function* jsonExport(context, subjectId, counts) {
  yield `{"formatVersion":1,"identity":${JSON.stringify(context.exportIdentity)},"records":[`;
  let first = true;
  for await (const { type, rows } of exportRecordPages(context, subjectId)) for (const data of rows) {
    counts.records += 1;
    yield `${first ? '' : ','}${JSON.stringify({ type, data })}`;
    first = false;
  }
  yield ']}';
}

function csvCell(value) {
  let text = value === null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
  if (/^[\s\u0000-\u001f]*[=+@-]/u.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export async function* csvExport(context, subjectId) {
  yield 'type,id,field,value\r\n';
  if (context.exportIdentity) for (const [field, value] of Object.entries(context.exportIdentity)) {
    yield ['Identity', subjectId, field, value].map(csvCell).join(',') + '\r\n';
  }
  for await (const { type, rows } of exportRecordPages(context, subjectId)) for (const row of rows) {
    for (const [field, value] of Object.entries(row)) yield [type, row.id ?? row.assetId ?? row.noteVersionId ?? '', field, value].map(csvCell).join(',') + '\r\n';
  }
}
