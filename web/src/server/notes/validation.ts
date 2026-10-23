import '../only.ts';
import { createHash } from 'node:crypto';
import { plainText } from '../activities/validation.ts';
import { allowedFields, invalidField, operationId } from '../stores/validation.ts';

export function noteInput(body: Record<string, unknown>) {
  allowedFields(body, ['operationId', 'expectedVersion', 'text']);
  const id = operationId(body);
  if (!Number.isInteger(body.expectedVersion) || Number(body.expectedVersion) < 0 || Number(body.expectedVersion) >= 2_147_483_647) invalidField();
  const text = plainText(body.text, 2_000);
  const expectedVersion = Number(body.expectedVersion);
  const requestDigest = createHash('sha256').update(JSON.stringify({ expectedVersion, text })).digest('hex');
  return { id, expectedVersion, text, requestDigest };
}
