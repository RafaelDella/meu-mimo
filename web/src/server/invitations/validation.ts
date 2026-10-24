import '../only.ts';
import { createHash } from 'node:crypto';
import type { CodeInvitationInput, ExpirationInput } from '../../contracts/invitations.ts';
import { allowedFields, invalidField, operationId } from '../stores/validation.ts';

const minuteInstant = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::00(?:\.000)?)?(Z|[+-]\d{2}:\d{2})$/;

export function parseMinuteInstant(value: unknown): { at: string; localDateTime: string; offset: string; instant: Date } {
  if (typeof value !== 'string') invalidField();
  const match = minuteInstant.exec(value);
  if (!match || !validCivilMinute(`${match[1]}T${match[2]}`)) invalidField();
  const offset = match[3] === 'Z' ? '+00:00' : match[3];
  const [hours, minutes] = offset.slice(1).split(':').map(Number);
  if (hours > 14 || minutes > 59 || (hours === 14 && minutes !== 0) || offset === '-00:00') invalidField();
  const instant = new Date(value);
  if (!Number.isFinite(instant.getTime())) invalidField();
  return { at: instant.toISOString(), localDateTime: `${match[1]}T${match[2]}`, offset, instant };
}

export function validCivilMinute(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) || value.startsWith('0000-')) return false;
  const date = new Date(`${value}:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 16) === value;
}

export function parseCodeInvitation(body: Record<string, unknown>): CodeInvitationInput {
  allowedFields(body, ['operationId', 'kind', 'expiration', 'maxUses']);
  const id = operationId(body);
  if (body.kind !== 'CODE') invalidField();
  if (body.maxUses !== null && (typeof body.maxUses !== 'number' || !Number.isInteger(body.maxUses) || body.maxUses < 1 || body.maxUses > 1_000_000)) invalidField();
  const value = body.expiration;
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalidField();
  const expiration = value as Record<string, unknown>;
  let result: ExpirationInput;
  if (expiration.kind === 'NEVER') {
    allowedFields(expiration, ['kind']);
    result = { kind: 'NEVER' };
  } else if (expiration.kind === 'AFTER_DAYS') {
    allowedFields(expiration, ['kind', 'days']);
    if (expiration.days !== 7) invalidField();
    result = { kind: 'AFTER_DAYS', days: 7 };
  } else if (expiration.kind === 'AT') {
    allowedFields(expiration, ['kind', 'at']);
    parseMinuteInstant(expiration.at);
    // Preserva o offset para conferir sua correspondência com o fuso da loja.
    result = { kind: 'AT', at: expiration.at as string };
  } else return invalidField();
  return { operationId: id, kind: 'CODE', expiration: result, maxUses: body.maxUses as number | null };
}

export function creationDigest(input: CodeInvitationInput): string {
  const expiration = input.expiration.kind === 'AT'
    ? { kind: 'AT', at: parseMinuteInstant(input.expiration.at).at } : input.expiration;
  return createHash('sha256').update(JSON.stringify({ kind: 'CODE', expiration, maxUses: input.maxUses })).digest('hex');
}
