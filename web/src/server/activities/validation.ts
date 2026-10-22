import '../only.ts';
import { createHash } from 'node:crypto';
import type { ActivityFields } from '../../contracts/activities.ts';
import { invalidField } from '../stores/validation.ts';

export const activityFields = ['name', 'description', 'category', 'sticker', 'points', 'frequency', 'weeklyLimit', 'approvalMode'] as const;

export function plainText(value: unknown, maximum: number, optional = false): string {
  if (optional && value === undefined) return '';
  if (typeof value !== 'string') invalidField();
  const text = value.trim();
  if ((!optional && !text) || [...text].length > maximum ||
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text) || /[\uD800-\uDFFF]/u.test(text)) invalidField();
  return text;
}

export function positiveInteger(value: unknown, maximum = 2_147_483_647): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > maximum) invalidField();
  return value;
}

export function configuration(body: Record<string, unknown>): ActivityFields {
  const frequency = body.frequency === undefined ? 'DAILY' : body.frequency;
  const approvalMode = body.approvalMode === undefined ? 'MANUAL' : body.approvalMode;
  const sticker = body.sticker === undefined ? '' : body.sticker;
  if (typeof frequency !== 'string' || !['ONCE', 'DAILY', 'WEEKLY'].includes(frequency) ||
      typeof approvalMode !== 'string' || !['MANUAL', 'AUTOMATIC'].includes(approvalMode) ||
      typeof sticker !== 'string' || !['', 'gift', 'coffee', 'takeout', 'envelope'].includes(sticker)) invalidField();
  const weeklyLimit = positiveInteger(body.weeklyLimit === undefined ? 1 : body.weeklyLimit, 100);
  if (frequency !== 'WEEKLY' && weeklyLimit !== 1) invalidField();
  return {
    name: plainText(body.name, 80), description: plainText(body.description, 1_000, true),
    category: plainText(body.category, 80, true), sticker: sticker as ActivityFields['sticker'],
    points: positiveInteger(body.points, 1_000_000), frequency: frequency as ActivityFields['frequency'],
    weeklyLimit, approvalMode: approvalMode as ActivityFields['approvalMode'],
  };
}

export function digest(value: object): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
