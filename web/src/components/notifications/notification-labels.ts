import type { NotificationCategory, NotificationKind } from '@/contracts/notifications';

export const categoryLabels: Record<NotificationCategory, string> = { NOTES: 'Bilhetes', ACTIVITIES: 'Atividades e análise', REWARDS: 'Mimos, tickets e álbuns', SOCIAL: 'Interações' };
export const notificationLabels: Record<NotificationKind, string> = {
  INVITATION_ACCEPTED: 'aceitou o convite da loja', COMMENT_CREATED: 'comentou no item',
  SUBMISSION_RECEIVED: 'enviou uma conquista', SUBMISSION_REVIEWED: 'atualizou a análise da conquista',
  SUBMISSION_RESPONDED: 'enviou um complemento à análise', REDEMPTION_ISSUED: 'resgatou um mimo',
  REDEMPTION_UPDATED: 'atualizou o ticket', ALBUM_PUBLISHED: 'publicou momentos no álbum',
  NOTE_SENT: 'enviou um bilhete para você', REACTION_CHANGED: 'reagiu ao item',
};
