import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { required } from './environment.mjs';

export function localTokenPair(accessToken) {
  const secret = required('T02_JWT_SECRET');
  const [originalHeader, payload] = accessToken.split('.');
  assert.ok(['ES256', 'HS256'].includes(JSON.parse(Buffer.from(originalHeader, 'base64url').toString('utf8')).alg),
    'A prova local exige um token real emitido pelo Auth da fixture.');
  const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  // O Auth atual pode emitir ES256 e ainda aceitar a chave HMAC local legada.
  // O teste exige aceitação HTTP do par vigente antes de provar a expiração.
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const sign = payloadClaims => {
    const encoded = Buffer.from(JSON.stringify(payloadClaims)).toString('base64url');
    const signature = createHmac('sha256', secret).update(`${header}.${encoded}`).digest('base64url');
    return `${header}.${encoded}.${signature}`;
  };
  return {
    valid: sign({ ...claims, iat: now - 3600, exp: now + 60 }),
    expired: sign({ ...claims, iat: now - 3600, exp: now - 60 }),
  };
}

export function tokenClaims(token) {
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
}
