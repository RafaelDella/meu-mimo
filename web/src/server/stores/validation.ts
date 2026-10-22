import '../only.ts';
import { AppError } from '../errors.ts';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function invalidField(): never {
  throw new AppError('field_invalid', 400, 'Confira os campos do formulário.');
}

export function unavailable(): never {
  throw new AppError('resource_not_found', 404, 'Este recurso não está disponível.');
}

export function resourceId(value: string): string {
  if (!uuid.test(value)) unavailable();
  return value.toLowerCase();
}

export function operationId(body: Record<string, unknown>): string {
  if (typeof body.operationId !== 'string' || !uuid.test(body.operationId)) invalidField();
  return body.operationId.toLowerCase();
}

export function allowedFields(body: Record<string, unknown>, fields: readonly string[]): void {
  if (Object.keys(body).some(key => !fields.includes(key))) invalidField();
}

export function textField(body: Record<string, unknown>, key: string, maximum: number, optional = false): string {
  const value = body[key];
  if (optional && value === undefined) return '';
  if (typeof value !== 'string') invalidField();
  const text = value.trim();
  if ((!optional && !text) || text.length > maximum || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) invalidField();
  return text;
}

export function timezoneField(body: Record<string, unknown>): string {
  const value = textField(body, 'timezone', 80);
  try { return new Intl.DateTimeFormat('pt-BR', { timeZone: value }).resolvedOptions().timeZone; }
  catch { return invalidField(); }
}

export type Pagination = { page: number; pageSize: number; skip: number; q: string };

export function pagination(query = new URLSearchParams()): Pagination {
  function integer(key: string, fallback: number, maximum: number) {
    const value = query.get(key);
    if (value === null) return fallback;
    if (!/^[1-9]\d*$/.test(value)) invalidField();
    const result = Number(value);
    if (!Number.isSafeInteger(result) || result > maximum) invalidField();
    return result;
  }
  const page = integer('page', 1, 1_000_000);
  const pageSize = integer('pageSize', 20, 50);
  const q = query.get('q')?.trim() ?? '';
  if (q.length > 80 || /[\u0000-\u001f\u007f]/.test(q)) invalidField();
  return { page, pageSize, skip: (page - 1) * pageSize, q };
}

export function choice<T extends string>(query: URLSearchParams, key: string, values: readonly T[]): T | null {
  const value = query.get(key);
  if (value === null) return null;
  if (!values.includes(value as T)) invalidField();
  return value as T;
}

export function operationConflict(): never {
  throw new AppError('operation_conflict', 409, 'Esta operação já foi usada com outros dados. Confira o resultado antes de tentar novamente.');
}
