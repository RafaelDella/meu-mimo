import type { TicketAction } from '@/contracts/redemptions';

export const actionLabels: Record<TicketAction, string> = {
  AGREE: 'Registrar combinado', FULFILL: 'Marcar realização', REQUEST_CANCELLATION: 'Pedir cancelamento',
  REJECT_CANCELLATION: 'Recusar pedido', CANCEL: 'Cancelar e devolver pontos',
};
export const confirmationLabels: Record<TicketAction, string> = {
  AGREE: 'Salvar combinado', FULFILL: 'Confirmar realização', REQUEST_CANCELLATION: 'Enviar pedido de cancelamento',
  REJECT_CANCELLATION: 'Confirmar recusa', CANCEL: 'Confirmar cancelamento e devolução',
};
export const eventLabels = { ISSUED: 'Ticket emitido', AGREE: 'Combinado registrado', FULFILL: 'Mimo realizado',
  REQUEST_CANCELLATION: 'Cancelamento solicitado', REJECT_CANCELLATION: 'Pedido de cancelamento recusado', CANCEL: 'Ticket cancelado e pontos devolvidos' };
export function civilDate(value: string) { return value.split('-').reverse().join('/'); }
