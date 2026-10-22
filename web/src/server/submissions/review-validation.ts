import '../only.ts';
import type { ResponseBody, ReviewAction, ReviewBody } from '../../contracts/activities.ts';
import { plainText, positiveInteger } from '../activities/validation.ts';
import { allowedFields, invalidField, operationId, resourceId } from '../stores/validation.ts';

function version(value: unknown): number {
  if (value === 0) return 0;
  return positiveInteger(value, 2_147_483_646);
}

export function reviewInput(body: Record<string, unknown>): ReviewBody {
  allowedFields(body, ['operationId', 'expectedVersion', 'action', 'reason', 'expectedBalance']);
  if (typeof body.action !== 'string' || !['APPROVE', 'CONTEST', 'VOID', 'REOPEN'].includes(body.action)) invalidField();
  const action = body.action as ReviewAction;
  if (typeof body.expectedBalance !== 'string' || !/^(?:0|-?[1-9]\d*)$/.test(body.expectedBalance)) invalidField();
  const reason = plainText(body.reason, 500, action === 'APPROVE');
  if (action === 'APPROVE' && reason) invalidField();
  return { operationId: operationId(body), expectedVersion: version(body.expectedVersion), action,
    reason, expectedBalance: BigInt(body.expectedBalance).toString() };
}

export function responseInput(body: Record<string, unknown>): ResponseBody {
  allowedFields(body, ['operationId', 'expectedVersion', 'requestId', 'evidenceRevision', 'text', 'evidenceAssetId']);
  if (typeof body.requestId !== 'string' || (body.evidenceAssetId !== null && typeof body.evidenceAssetId !== 'string')) invalidField();
  const text = plainText(body.text, 500, true);
  const evidenceAssetId = body.evidenceAssetId === null ? null : resourceId(body.evidenceAssetId as string);
  if (!text && !evidenceAssetId) invalidField();
  return { operationId: operationId(body), expectedVersion: version(body.expectedVersion),
    requestId: resourceId(body.requestId), evidenceRevision: positiveInteger(body.evidenceRevision), text, evidenceAssetId };
}
