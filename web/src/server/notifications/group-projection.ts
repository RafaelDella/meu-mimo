import '../only.ts';
import { randomUUID } from 'node:crypto';
import type { StoreTransaction } from '../stores/transaction.ts';
import { databaseNow } from '../stores/transaction.ts';
import { unavailable } from '../stores/validation.ts';

/** A entrega e a associação ao grupo confirmam juntas; replay não avança a versão. */
export async function projectNotificationGroup(tx: StoreTransaction, notificationId: string): Promise<void> {
  const notification = await tx.notification.findUnique({ where: { id: notificationId }, include: { event: true } });
  if (!notification) unavailable();
  if (notification.groupId) return;
  const metadata = await tx.$queryRaw<{ key: string; category: string }[]>`
    SELECT app.notification_group_key(${notification.eventId}::uuid,${notification.id}::uuid) AS key,
      app.notification_category(${notification.event.kind}::text) AS category`;
  const { key, category } = metadata[0];
  const now = await databaseNow(tx);
  const event = notification.event;
  await tx.notificationGroup.createMany({ data: { id: randomUUID(), key, category,
    storeId: event.storeId, recipientMembershipId: event.recipientMembershipId,
    actorProfileId: event.actorProfileId, version: 0, lastDeliveredAt: now }, skipDuplicates: true });
  await tx.$queryRaw`SELECT id FROM app."NotificationGroup" WHERE key=${key} FOR UPDATE`;
  const group = await tx.notificationGroup.update({ where: { key }, data: {
    version: { increment: 1 }, lastDeliveredAt: await databaseNow(tx),
  } });
  await tx.notification.update({ where: { id: notification.id }, data: { groupId: group.id, groupVersion: group.version } });
}
