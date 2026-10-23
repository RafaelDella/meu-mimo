import '../only.ts';
import type { TicketTransitionBody } from '../../contracts/redemptions.ts';
import { digest, plainText, positiveInteger } from '../activities/validation.ts';
import { allowedFields, invalidField, operationId } from '../stores/validation.ts';
import { localDate } from '../submissions/validation.ts';

function balance(value: unknown): string {
  if (typeof value !== 'string' || !/^(?:0|-?[1-9]\d{0,18})$/.test(value)) invalidField();
  const amount = BigInt(value);
  if (amount < -9_223_372_036_854_775_808n || amount > 9_223_372_036_854_775_807n) invalidField();
  return amount.toString();
}

export function transitionInput(body: Record<string, unknown>) {
  const base = { operationId: operationId(body), expectedVersion: positiveInteger(body.expectedVersion) };
  let input: TicketTransitionBody;
  switch (body.action) {
    case 'AGREE':
      allowedFields(body, ['operationId', 'expectedVersion', 'action', 'text', 'agreementDate']);
      input = { ...base, action: 'AGREE', text: plainText(body.text, 500),
        agreementDate: body.agreementDate === undefined || body.agreementDate === null ? null : localDate(body.agreementDate) };
      break;
    case 'FULFILL':
      allowedFields(body, ['operationId', 'expectedVersion', 'action']);
      input = { ...base, action: 'FULFILL' };
      break;
    case 'REQUEST_CANCELLATION':
    case 'REJECT_CANCELLATION':
      allowedFields(body, ['operationId', 'expectedVersion', 'action', 'text']);
      input = { ...base, action: body.action, text: plainText(body.text, 500) };
      break;
    case 'CANCEL': {
      allowedFields(body, ['operationId', 'expectedVersion', 'action', 'text', 'expectedBalance', 'restock', 'expectedStockRevision']);
      if (typeof body.restock !== 'boolean' || (!body.restock && body.expectedStockRevision !== undefined)) invalidField();
      input = { ...base, action: 'CANCEL', text: plainText(body.text, 500), expectedBalance: balance(body.expectedBalance),
        restock: body.restock, ...(body.restock ? { expectedStockRevision: positiveInteger(body.expectedStockRevision) } : {}) };
      break;
    }
    default: return invalidField();
  }
  const { operationId: id, ...request } = input;
  return { input, id, requestDigest: digest(request) };
}
