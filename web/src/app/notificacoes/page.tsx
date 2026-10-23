import type { Metadata } from 'next';
import { NotificationCenter } from '@/components/notifications/notification-center';
export const metadata: Metadata = { title: 'Novidades · Meu Mimo', robots: { index: false, follow: false } };
export default function NotificationsPage() { return <NotificationCenter />; }
