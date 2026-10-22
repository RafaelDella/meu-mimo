import '../only.ts';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { Identity } from '../auth/types.ts';
import type { MediaVariant } from '../../contracts/media.ts';
import { AppError } from '../errors.ts';
import { resourceId, unavailable } from '../stores/validation.ts';

export type BrokerEnvelope = {
  identity: Identity; storeId: string; assetId: string; action: 'part' | 'content';
  expiresAt: number; offset?: number; variant?: MediaVariant; range?: string;
};

function secret(): string {
  const value = process.env.MEDIA_INTERNAL_SECRET;
  if (!value || !/^[a-f0-9]{64}$/.test(value)) throw new AppError('service_unavailable', 503, 'O serviço de mídia ainda não está configurado.');
  return value;
}

function mac(domain: string, payload: string): string {
  return createHmac('sha256', secret()).update(`${domain}\0${payload}`).digest('base64url');
}

function matches(expected: string, actual: string): boolean {
  return expected.length === actual.length && timingSafeEqual(Buffer.from(expected), Buffer.from(actual));
}

export function signBrokerEnvelope(envelope: BrokerEnvelope, body: Uint8Array = new Uint8Array()) {
  const encoded = Buffer.from(JSON.stringify(envelope)).toString('base64url');
  const digest = createHash('sha256').update(body).digest('hex');
  return { encoded, signature: mac('media-broker-v1', `${encoded}.${digest}`) };
}

export function verifyBrokerEnvelope(encoded: string, signature: string, body: Uint8Array = new Uint8Array()): BrokerEnvelope {
  if (encoded.length > 2048 || signature.length > 100) unavailable();
  const digest = createHash('sha256').update(body).digest('hex');
  if (!matches(mac('media-broker-v1', `${encoded}.${digest}`), signature)) unavailable();
  let value: BrokerEnvelope;
  try { value = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')); } catch { return unavailable(); }
  if (!value || !value.identity || !['part', 'content'].includes(value.action) ||
      !['aal1', 'aal2'].includes(value.identity.assuranceLevel) || !Number.isSafeInteger(value.expiresAt) ||
      value.expiresAt < Date.now() || value.expiresAt > Date.now() + 60_000) unavailable();
  resourceId(value.identity.userId); resourceId(value.identity.sessionId);
  resourceId(value.storeId); resourceId(value.assetId);
  if (value.action === 'part' && (!Number.isSafeInteger(value.offset) || value.offset! < 0)) unavailable();
  if (value.action === 'content' && (!['display', 'thumbnail'].includes(value.variant ?? '') ||
      (value.range !== undefined && (typeof value.range !== 'string' || value.range.length > 100)))) unavailable();
  return value;
}

export function signMediaAccess(identity: Identity, storeId: string, assetId: string, variant: MediaVariant): {token: string; expiresAt: number} {
  const expiresAt = Date.now() + 300_000;
  const payload = Buffer.from(JSON.stringify({ userId: identity.userId, sessionId: identity.sessionId,
    storeId, assetId, variant, expiresAt })).toString('base64url');
  return { token: `${payload}.${mac('media-access-v1', payload)}`, expiresAt };
}

export function verifyMediaAccess(token: string, identity: Identity, storeId: string, assetId: string): MediaVariant {
  if (token.length > 1024) unavailable();
  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra || !matches(mac('media-access-v1', payload), signature)) unavailable();
  let data;
  try { data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); } catch { return unavailable(); }
  if (!data || data.userId !== identity.userId || data.sessionId !== identity.sessionId ||
      data.storeId !== storeId || data.assetId !== assetId || !['display', 'thumbnail'].includes(data.variant) ||
      !Number.isSafeInteger(data.expiresAt) || data.expiresAt > Date.now() + 300_000) unavailable();
  if (data.expiresAt <= Date.now()) throw new AppError('media_url_expired', 410, 'Este acesso expirou. Abra o arquivo novamente.');
  return data.variant;
}
