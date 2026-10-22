import '../only.ts';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { getServerEnv } from '../env.ts';
import { AppError } from '../errors.ts';

export function invitationInvalid(): never {
  throw new AppError('invitation_invalid', 404, 'Este convite não está disponível. Confira o link com quem convidou.');
}

export function invitationToken(id: string, storeId: string, actorId: string): string {
  return createHmac('sha256', getServerEnv().rateLimitSecret)
    .update('meumimo:t04:invitation-token:v1\0').update(id).update('\0')
    .update(storeId).update('\0').update(actorId).digest('base64url');
}

export function invitationHash(token: string): string {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) invitationInvalid();
  return createHash('sha256').update(token).digest('hex');
}

export function matchesInvitationHash(token: string, hash: string): boolean {
  const actual = Buffer.from(invitationHash(token), 'hex');
  const stored = Buffer.from(hash, 'hex');
  return actual.length === stored.length && timingSafeEqual(actual, stored);
}
