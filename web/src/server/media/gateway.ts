import '../only.ts';
import type { Identity } from '../auth/types.ts';
import type { MediaAccess, MediaAssetView, MediaVariant } from '../../contracts/media.ts';
import { AppError } from '../errors.ts';
import { assertMutationOrigin } from '../http.ts';
import { consumeStoreLimit } from '../stores/limits.ts';
import { invalidField, resourceId, unavailable } from '../stores/validation.ts';
import { assertMediaRead, withMediaAsset } from './access.ts';
import { signBrokerEnvelope, signMediaAccess, verifyMediaAccess } from './tokens.ts';
import type { BrokerEnvelope } from './tokens.ts';
import { consumeMediaLimit } from './limits.ts';
import { localMediaTarget } from './local-target.ts';

export const MEDIA_PART_BYTES = 5 * 1024 * 1024;

async function broker(envelope: Omit<BrokerEnvelope, 'expiresAt'>, body?: Uint8Array): Promise<Response> {
  const endpoint = process.env.MEDIA_GATEWAY_URL;
  try { localMediaTarget(); }
  catch { throw new AppError('service_unavailable', 503, 'O serviço de mídia ainda não está configurado.'); }
  const signed = signBrokerEnvelope({ ...envelope, expiresAt: Date.now() + 30_000 }, body);
  const response = await fetch(`${endpoint}/${envelope.action}`, { method: 'POST', cache: 'no-store',
    headers: { 'x-media-envelope': signed.encoded, 'x-media-signature': signed.signature, 'content-type': 'application/octet-stream' },
    body: body ? new Uint8Array(body) : undefined, signal: AbortSignal.timeout(30_000) });
  if (!response.ok && response.status !== 206) {
    const allowed = [400, 401, 403, 404, 409, 410, 413, 415, 416, 429];
    let failure;
    try { failure = await response.json(); } catch { /* Resposta externa nunca vira mensagem privada. */ }
    const status = allowed.includes(response.status) ? response.status : 503;
    const code = typeof failure?.code === 'string' && /^[a-z_]{1,50}$/.test(failure.code) ? failure.code : 'service_unavailable';
    throw new AppError(code, status, status === 409 ? 'Confira o progresso deste arquivo antes de continuar.' : 'Não foi possível acessar esta mídia. Tente novamente.');
  }
  return response;
}

export async function uploadMediaPart(identity: Identity, storeId: string, assetId: string, request: Request): Promise<MediaAssetView> {
  assertMutationOrigin(request);
  resourceId(storeId); resourceId(assetId);
  if (!/^application\/octet-stream(?:;|$)/i.test(request.headers.get('content-type') ?? '')) {
    throw new AppError('content_type_invalid', 415, 'Envie o arquivo no formato esperado.');
  }
  const offsetValue = new URL(request.url).searchParams.get('offset');
  if (!offsetValue || !/^(0|[1-9]\d*)$/.test(offsetValue)) invalidField();
  const offset = Number(offsetValue);
  if (!Number.isSafeInteger(offset) || offset > 100_000_000) invalidField();
  await consumeMediaLimit(identity, 'part');
  const reader = request.body?.getReader();
  const parts: Uint8Array[] = [];
  let length = 0;
  if (reader) for (;;) {
    const item = await reader.read();
    if (item.done) break;
    length += item.value.length;
    if (length > MEDIA_PART_BYTES) { await reader.cancel(); throw new AppError('body_too_large', 413, 'Envie o arquivo em partes menores.'); }
    parts.push(item.value);
  }
  if (!length) invalidField();
  const response = await broker({ identity, storeId, assetId, action: 'part', offset }, Buffer.concat(parts));
  return response.json();
}

export async function issueMediaAccess(identity: Identity, storeId: string, assetId: string, body: Record<string, unknown>): Promise<MediaAccess> {
  if (Object.keys(body).some(key => key !== 'variant') || !['display', 'thumbnail'].includes(String(body.variant))) invalidField();
  const variant = body.variant as MediaVariant;
  await consumeStoreLimit(identity, 'read');
  await withMediaAsset(identity, storeId, assetId, async scope => {
    assertMediaRead(scope);
    if (scope.asset.state !== 'READY' || !scope.asset.outputVersion) unavailable();
  });
  const grant = signMediaAccess(identity, storeId, assetId, variant);
  return { url: `/api/lojas/${storeId}/midia/arquivos/${assetId}/conteudo?token=${grant.token}`,
    expiresAt: new Date(grant.expiresAt).toISOString() };
}

export async function readMediaContent(identity: Identity, storeId: string, assetId: string, request: Request): Promise<Response> {
  resourceId(storeId); resourceId(assetId);
  const variant = verifyMediaAccess(new URL(request.url).searchParams.get('token') ?? '', identity, storeId, assetId);
  await consumeMediaLimit(identity, 'part');
  const range = request.headers.get('range') ?? undefined;
  const response = await broker({ identity, storeId, assetId, action: 'content', variant, range });
  const headers = new Headers({ 'X-Content-Type-Options': 'nosniff', 'Content-Disposition': 'inline', 'Cache-Control': 'private, no-store' });
  for (const key of ['Content-Type', 'Content-Length', 'Content-Range', 'Accept-Ranges']) {
    const value = response.headers.get(key);
    if (value) headers.set(key, value);
  }
  return new Response(response.body, { status: response.status, headers });
}
