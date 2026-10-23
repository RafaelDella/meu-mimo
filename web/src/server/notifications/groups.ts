import '../only.ts';
import type { NotificationGroupPage, NotificationGroupView, NotificationTarget } from '../../contracts/notifications.ts';
import type { Identity } from '../auth/types.ts';
import { getDb } from '../db/client.ts';
import { suppressionFor } from '../privacy/suppression.ts';
import { consumeStoreLimit } from '../stores/limits.ts';
import { databaseNow, withIdentityTransaction, withStoreTransaction } from '../stores/transaction.ts';
import { choice, invalidField, pagination, resourceId, unavailable } from '../stores/validation.ts';
import { attentionUnreadCount, groupAudience, groupSelect, groupView } from './group-queries.ts';
import { notificationAudience, notificationSelect, notificationTarget } from './queries.ts';

export async function listNotificationGroups(identity: Identity, query = new URLSearchParams()): Promise<NotificationGroupPage> {
  const page = pagination(query); const filter = query.get('storeId');
  const storeId = filter === null ? undefined : resourceId(filter);
  const category = choice(query, 'category', ['NOTES', 'ACTIVITIES', 'REWARDS', 'SOCIAL'] as const);
  await consumeStoreLimit(identity, 'read');
  return withIdentityTransaction(identity, async tx => {
    const where = { ...groupAudience(identity, storeId), ...(category ? { category } : {}) };
    const total = await tx.notificationGroup.count({ where });
    const rows = await tx.notificationGroup.findMany({ where, select: groupSelect,
      orderBy: [{ lastDeliveredAt: 'desc' }, { id: 'desc' }], skip: page.skip, take: page.pageSize });
    const items: NotificationGroupView[] = [];
    const authors = await tx.notification.findMany({ where: { groupId: { in: rows.map(row => row.id) }, ...notificationAudience(identity, storeId) },
      select: { event: { select: { actorProfileId: true } } } });
    const suppressions = await suppressionFor(tx, [...rows.map(row => row.store.createdByProfileId), ...authors.map(row => row.event.actorProfileId)]);
    for (const row of rows) items.push(await groupView(tx, identity, row, suppressions));
    return { items, total, page: page.page, pageSize: page.pageSize, attentionUnreadCount: await attentionUnreadCount(tx, identity, storeId) };
  });
}

async function storeForGroup(id: string): Promise<string> {
  const group = await getDb().notificationGroup.findUnique({ where: { id }, select: { storeId: true } });
  if (!group) unavailable();
  return group.storeId;
}

export async function markNotificationGroupRead(identity: Identity, groupId: string, throughVersion: number): Promise<NotificationGroupView> {
  const id = resourceId(groupId);
  if (!Number.isInteger(throughVersion) || throughVersion < 1 || throughVersion > 2_147_483_647) invalidField();
  await consumeStoreLimit(identity, 'write');
  const storeId = await storeForGroup(id);
  return withStoreTransaction(identity, storeId, async scope => {
    await scope.tx.$queryRaw`SELECT id FROM app."NotificationGroup" WHERE id=${id}::uuid FOR UPDATE`;
    const group = await scope.tx.notificationGroup.findFirst({ where: { id, ...groupAudience(identity, storeId) }, select: groupSelect });
    if (!group) unavailable();
    if (throughVersion > group.version) invalidField();
    await scope.tx.notification.updateMany({ where: { groupId: id, groupVersion: { lte: throughVersion }, readAt: null,
      ...notificationAudience(identity, storeId) }, data: { readAt: await databaseNow(scope.tx) } });
    return groupView(scope.tx, identity, group);
  });
}

export async function resolveNotificationGroupTarget(identity: Identity, groupId: string): Promise<NotificationTarget> {
  const id = resourceId(groupId);
  await consumeStoreLimit(identity, 'read');
  const storeId = await storeForGroup(id);
  return withStoreTransaction(identity, storeId, async scope => {
    const group = await scope.tx.notificationGroup.findFirst({ where: { id, ...groupAudience(identity, storeId) }, select: { id: true } });
    if (!group) unavailable();
    const latest = await scope.tx.notification.findFirst({ where: { groupId: id, ...notificationAudience(identity, storeId) },
      select: notificationSelect, orderBy: [{ event: { createdAt: 'desc' } }, { id: 'desc' }] });
    if (!latest) unavailable();
    return notificationTarget(latest, scope.tx);
  });
}
