import '../only.ts';
import { Prisma } from '../../generated/prisma/client.ts';
import type { FeedPage } from '../../contracts/feed.ts';
import { requireConversationAudience } from '../conversations/access.ts';
import { movementRange } from '../points/queries.ts';
import type { StoreScope } from '../stores/transaction.ts';
import { requireMembership } from '../stores/transaction.ts';
import { choice, invalidField, pagination, resourceId } from '../stores/validation.ts';
import { localDate } from '../submissions/validation.ts';
import { feedItem } from './views.ts';
import { suppressionFor } from '../privacy/suppression.ts';

export type FeedAddress = { id: string; subjectType: 'SUBMISSION' | 'TICKET'; occurredAt: Date; conversationId: string };
const submissionStatuses = ['PENDING', 'APPROVED', 'CONTESTED', 'VOIDED'] as const;
const ticketStatuses = ['WAITING_AGREEMENT', 'AGREED', 'FULFILLED', 'CANCELLATION_REQUESTED', 'CANCELLED'] as const;

export async function feedPage(scope: StoreScope, query: URLSearchParams): Promise<FeedPage> {
  const actor = requireMembership(scope);
  const page = pagination(query);
  const type = choice(query, 'type', ['SUBMISSION', 'TICKET'] as const);
  const status = choice(query, 'status', [...submissionStatuses, ...ticketStatuses]);
  if (status && ((type === 'SUBMISSION' && !(submissionStatuses as readonly string[]).includes(status)) ||
      (type === 'TICKET' && !(ticketStatuses as readonly string[]).includes(status)))) invalidField();
  const requested = query.get('participantMembershipId');
  if (requested !== null && actor.role !== 'MERCHANT') invalidField();
  const participantId = actor.role === 'PARTICIPANT' ? actor.id : requested === null ? null : resourceId(requested);
  if (participantId) await requireConversationAudience(scope, participantId);
  const from = query.has('from') ? localDate(query.get('from')) : null;
  const to = query.has('to') ? localDate(query.get('to')) : null;
  if (from && to && from > to) invalidField();
  const range = from || to ? await movementRange(scope, from, to) : {};
  // Paginar a união no servidor mantém uma só ordem e um card por origem.
  const projection = Prisma.sql`
    SELECT s.id, 'SUBMISSION'::text AS "subjectType", s."receivedAt" AS "occurredAt", c.id AS "conversationId",
      s.status::text AS status, CASE WHEN EXISTS(SELECT 1 FROM app."DataSuppression" d
        WHERE d."subjectProfileId"=a."createdByProfileId" AND d.scope='AUTHORED_CONTENT')
        THEN '[Conteúdo removido]' ELSE s."activityName" END AS name, s."participantMembershipId"
    FROM app."ActivitySubmission" s
    JOIN app."Activity" a ON a.id=s."activityId"
    JOIN app."Membership" m ON m.id=s."participantMembershipId" AND m."storeId"=s."storeId"
      AND m.role='PARTICIPANT' AND m."accessRevokedAt" IS NULL
    JOIN app."Conversation" c ON c."subjectType"='SUBMISSION' AND c."subjectId"=s.id
      AND c."storeId"=s."storeId" AND c."participantMembershipId"=s."participantMembershipId"
    WHERE s."storeId"=${scope.store.id}::uuid AND s."receivedAt" IS NOT NULL AND s.status<>'DRAFT'
    UNION ALL
    SELECT t.id, 'TICKET'::text AS "subjectType", t."createdAt" AS "occurredAt", c.id AS "conversationId",
      t.status::text AS status, CASE WHEN EXISTS(SELECT 1 FROM app."DataSuppression" d
        WHERE d."subjectProfileId"=r."createdByProfileId" AND d.scope='AUTHORED_CONTENT')
        THEN '[Conteúdo removido]' ELSE t."rewardName" END AS name, t."participantMembershipId"
    FROM app."Redemption" t
    JOIN app."Reward" r ON r.id=t."rewardId"
    JOIN app."Membership" m ON m.id=t."participantMembershipId" AND m."storeId"=t."storeId"
      AND m.role='PARTICIPANT' AND m."accessRevokedAt" IS NULL
    JOIN app."Conversation" c ON c."subjectType"='TICKET' AND c."subjectId"=t.id
      AND c."storeId"=t."storeId" AND c."participantMembershipId"=t."participantMembershipId"
    WHERE t."storeId"=${scope.store.id}::uuid`;
  const filters = Prisma.sql`
    (${participantId}::uuid IS NULL OR feed."participantMembershipId"=${participantId}::uuid)
    AND (${type}::text IS NULL OR feed."subjectType"=${type})
    AND (${status}::text IS NULL OR feed.status=${status})
    AND (${range.gte ?? null}::timestamptz IS NULL OR feed."occurredAt">=${range.gte ?? null})
    AND (${range.lt ?? null}::timestamptz IS NULL OR feed."occurredAt"<${range.lt ?? null})
    AND (${page.q}='' OR strpos(lower(feed.name),lower(${page.q}))>0)`;
  const totals = await scope.tx.$queryRaw<{ total: number }[]>(Prisma.sql`SELECT count(*)::int AS total FROM (${projection}) feed WHERE ${filters}`);
  const rows = await scope.tx.$queryRaw<FeedAddress[]>(Prisma.sql`
    SELECT id,"subjectType","occurredAt","conversationId" FROM (${projection}) feed WHERE ${filters}
    ORDER BY "occurredAt" DESC,id DESC,"subjectType" DESC LIMIT ${page.pageSize} OFFSET ${page.skip}`);
  const items = [];
  const submissions = await scope.tx.activitySubmission.findMany({ where: { id: { in: rows.filter(row => row.subjectType === 'SUBMISSION').map(row => row.id) } },
    select: { authorProfileId: true, activity: { select: { createdByProfileId: true } }, participant: { select: { profileId: true } } } });
  const tickets = await scope.tx.redemption.findMany({ where: { id: { in: rows.filter(row => row.subjectType === 'TICKET').map(row => row.id) } },
    select: { reward: { select: { createdByProfileId: true } }, participant: { select: { profileId: true } },
      events: { where: { kind: 'AGREE' }, orderBy: { version: 'desc' }, take: 1, select: { actorProfileId: true } } } });
  const reactions = await scope.tx.reaction.findMany({ where: { conversationId: { in: rows.map(row => row.conversationId) } }, select: { actorProfileId: true } });
  const suppressions = await suppressionFor(scope.tx, [...submissions.flatMap(row => [row.authorProfileId, row.activity.createdByProfileId, row.participant.profileId]),
    ...tickets.flatMap(row => [row.reward.createdByProfileId, row.participant.profileId, ...row.events.map(event => event.actorProfileId)]), ...reactions.map(row => row.actorProfileId)]);
  for (const row of rows) items.push(await feedItem(scope, row, suppressions));
  return { items, total: totals[0].total, page: page.page, pageSize: page.pageSize };
}
