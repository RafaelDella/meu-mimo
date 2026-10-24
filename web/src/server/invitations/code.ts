import '../only.ts';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { invitationCodeAlphabet } from '../../lib/invitation-code.ts';
import { getServerEnv } from '../env.ts';

export function deriveInvitationCode(id: string, storeId: string, actorId: string, nonce: number): string {
  if ([id, storeId, actorId].some(value => value.includes('\0')) || !Number.isInteger(nonce) || nonce < 0 || nonce > 4) {
    throw new Error('Contexto do convite inválido.');
  }
  const bytes = createHmac('sha256', getServerEnv().rateLimitSecret)
    .update('meumimo:invitation-code:v1\0').update(id).update('\0').update(storeId).update('\0')
    .update(actorId).update('\0').update(String(nonce)).digest();
  let bits = 0n;
  for (const byte of bytes.subarray(0, 7)) bits = (bits << 8n) | BigInt(byte);
  bits >>= 6n;
  let code = '';
  for (let index = 9; index >= 0; index -= 1) code += invitationCodeAlphabet[Number((bits >> BigInt(index * 5)) & 31n)];
  return code;
}

/** Recebe somente o formato compacto já validado; o código bruto nunca vai ao banco. */
export function invitationCodeHash(normalized: string): string {
  return createHmac('sha256', getServerEnv().rateLimitSecret)
    .update('meumimo:invitation-code-lookup:v1\0').update(normalized).digest('hex');
}

export function matchesCodeHash(normalized: string, stored: string): boolean {
  const actual = Buffer.from(invitationCodeHash(normalized), 'hex');
  const expected = Buffer.from(stored, 'hex');
  return expected.length === actual.length && timingSafeEqual(actual, expected);
}
