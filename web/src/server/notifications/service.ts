import '../only.ts';
import type { NotificationPage, NotificationTarget, NotificationView } from '../../contracts/notifications.ts';
import type { Identity } from '../auth/types.ts';
import { getDb } from '../db/client.ts';
import { suppressionFor } from '../privacy/suppression.ts';
import { consumeStoreLimit } from '../stores/limits.ts';
import { databaseNow, withIdentityTransaction, withStoreTransaction } from '../stores/transaction.ts';
import { pagination, resourceId, unavailable } from '../stores/validation.ts';
import { notificationAudience, notificationSelect, notificationTarget, notificationView } from './queries.ts';

export async function listNotifications(identity: Identity, query = new URLSearchParams()): Promise<NotificationPage> {
  const page = pagination(query);
  const storeFilter = query.get('storeId');
  const storeId = storeFilter === null ? undefined : resourceId(storeFilter);
  await consumeStoreLimit(identity, 'read');
  return withIdentityTransaction(identity, async tx => {
    const where = notificationAudience(identity, storeId);
    const total = await tx.notification.count({ where });
    const unreadCount = await tx.notification.count({ where: { ...where, readAt: null } });
    const notifications = await tx.notification.findMany({
      where, select: notificationSelect, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: page.skip, take: page.pageSize,
    });
    const suppressions = await suppressionFor(tx, notifications.flatMap(row => [row.event.actorProfileId, row.event.store.createdByProfileId]));
    return { items: notifications.map(row => notificationView(row, suppressions)), page: page.page, pageSize: page.pageSize, total, unreadCount };
  });
}

async function storeForNotification(notificationId: string): Promise<string> {
  const notification = await getDb().notification.findUnique({
    where: { id: notificationId }, select: { event: { select: { storeId: true } } },
  });
  if (!notification) unavailable();
  return notification.event.storeId;
}

export async function markNotificationRead(identity: Identity, notificationId: string): Promise<NotificationView> {
  const id = resourceId(notificationId);
  await consumeStoreLimit(identity, 'write');
  const storeId = await storeForNotification(id);
  return withStoreTransaction(identity, storeId, async scope => {
    await scope.tx.$queryRaw`SELECT id FROM app."Notification" WHERE id = ${id}::uuid FOR UPDATE`;
    const current = await scope.tx.notification.findFirst({ where: { id, ...notificationAudience(identity, storeId) }, select: notificationSelect });
    if (!current) unavailable();
    if (current.readAt) return notificationView(current, await suppressionFor(scope.tx, [current.event.actorProfileId, current.event.store.createdByProfileId]));
    const read = await scope.tx.notification.update({
      where: { id }, data: { readAt: await databaseNow(scope.tx) }, select: notificationSelect,
    });
    return notificationView(read, await suppressionFor(scope.tx, [read.event.actorProfileId, read.event.store.createdByProfileId]));
  });
}

export async function resolveNotificationTarget(identity: Identity, notificationId: string): Promise<NotificationTarget> {
  const id = resourceId(notificationId);
  await consumeStoreLimit(identity, 'read');
  const storeId = await storeForNotification(id);
  return withStoreTransaction(identity, storeId, async scope => {
    const current = await scope.tx.notification.findFirst({ where: { id, ...notificationAudience(identity, storeId) }, select: notificationSelect });
    if (!current) unavailable();
    return notificationTarget(current, scope.tx);
  });
}
