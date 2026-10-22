import '../only.ts';
import { plainText, positiveInteger } from '../activities/validation.ts';
import { allowedFields, invalidField, resourceId } from '../stores/validation.ts';

export function localDate(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000-')) invalidField();
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) invalidField();
  return value;
}

export function submissionInput(body: Record<string, unknown>) {
  allowedFields(body, ['caption', 'evidenceAssetId', 'expectedVersion', 'expectedLocalDate', 'expectedTimezone']);
  if (body.evidenceAssetId !== null && typeof body.evidenceAssetId !== 'string') invalidField();
  return { caption: plainText(body.caption, 500, true),
    evidenceAssetId: body.evidenceAssetId === null ? null : resourceId(body.evidenceAssetId as string),
    expectedVersion: positiveInteger(body.expectedVersion), expectedLocalDate: localDate(body.expectedLocalDate),
    expectedTimezone: plainText(body.expectedTimezone, 80) };
}
