import '../only.ts';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { getServerEnv } from '../env.ts';
import { AppError } from '../errors.ts';

export const AUTH_COOKIE_NAME = 'meumimo-auth';
export type AuthFlowPurpose = 'signup' | 'recovery';

const contextLifetime = 3600;
const verifierNamePattern = /^meumimo-auth(?:-flow-[a-zA-Z0-9_-]{8,64})?-code-verifier$/;

export function isVerifierCookie(name: string) {
  return verifierNamePattern.test(name);
}

export function flowContextCookieName(verifierName: string) {
  return `${verifierName}-context`;
}

function invalidContext(): never {
  throw new AppError('callback_invalid', 400, 'Este link não pôde ser confirmado. Solicite outro.');
}

function validVerifier(encoded: string): boolean {
  if (encoded.length > 512 || !/^base64-[A-Za-z0-9_-]+$/.test(encoded)) return false;
  try {
    const verifier: unknown = JSON.parse(Buffer.from(encoded.slice(7), 'base64url').toString('utf8'));
    return typeof verifier === 'string' && /^[A-Za-z0-9._~-]{43,128}(?:\/recovery)?$/.test(verifier);
  } catch {
    return false;
  }
}

function signature(secret: string, name: string, verifier: string, payload: string) {
  const key = createHmac('sha256', secret).update('meumimo.pkce.context.v1').digest();
  return createHmac('sha256', key)
    .update(JSON.stringify([name, verifier, payload])).digest('base64url');
}

// A coleção contém somente escritas novas observadas no adaptador do SDK desta requisição.
export async function sealAuthFlowContexts(verifiers: ReadonlyMap<string, string>, purpose: AuthFlowPurpose) {
  const environment = getServerEnv();
  const cookieStore = await cookies();
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + contextLifetime;
  const payload = Buffer.from(JSON.stringify({ v: 1, purpose, iat: issuedAt, exp: expiresAt }))
    .toString('base64url');
  for (const [name, verifier] of verifiers) {
    if (!isVerifierCookie(name) || !validVerifier(verifier)) invalidContext();
    cookieStore.set(flowContextCookieName(name),
      `${payload}.${signature(environment.rateLimitSecret, name, verifier, payload)}`, {
        path: '/', httpOnly: true, sameSite: 'lax',
        secure: new URL(environment.appOrigin).protocol === 'https:',
        maxAge: contextLifetime, expires: new Date(expiresAt * 1000),
      });
  }
}

export async function requireAuthFlowContext(flowId: string | null): Promise<AuthFlowPurpose> {
  const environment = getServerEnv();
  if (flowId !== null && !/^[a-zA-Z0-9_-]{8,64}$/.test(flowId)) invalidContext();
  const name = flowId === null ? `${AUTH_COOKIE_NAME}-code-verifier`
    : `${AUTH_COOKIE_NAME}-flow-${flowId}-code-verifier`;
  const cookieStore = await cookies();
  const verifier = cookieStore.get(name)?.value;
  const context = cookieStore.get(flowContextCookieName(name))?.value;
  if (!verifier || !validVerifier(verifier) || !context || context.length > 512) invalidContext();
  const parts = context.split('.');
  if (parts.length !== 2 || !/^[A-Za-z0-9_-]+$/.test(parts[0]) ||
      !/^[A-Za-z0-9_-]{43}$/.test(parts[1])) invalidContext();
  const [payload, tag] = parts;
  const expected = signature(environment.rateLimitSecret, name, verifier, payload);
  if (!timingSafeEqual(Buffer.from(tag), Buffer.from(expected))) invalidContext();
  let claims: unknown;
  try {
    claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    invalidContext();
  }
  if (!claims || typeof claims !== 'object' || !('v' in claims) || claims.v !== 1 ||
      !('purpose' in claims) || (claims.purpose !== 'signup' && claims.purpose !== 'recovery') ||
      !('iat' in claims) || typeof claims.iat !== 'number' || !Number.isSafeInteger(claims.iat) ||
      !('exp' in claims) || typeof claims.exp !== 'number' || !Number.isSafeInteger(claims.exp)) invalidContext();
  const now = Math.floor(Date.now() / 1000);
  if (claims.iat > now || claims.exp <= now || claims.exp <= claims.iat ||
      claims.exp - claims.iat > contextLifetime) invalidContext();
  return claims.purpose;
}
