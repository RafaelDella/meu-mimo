import '../only.ts';
import { AppError } from '../errors.ts';
import { readJsonObject, stringField } from '../http.ts';
import { auditEvent } from '../audit/events.ts';
import { createAuthClient } from './client.ts';
import { readVerifiedIdentity, requireIdentity } from './session.ts';
import { registerAuthSession } from './sessions.ts';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function factorField(body: Record<string, unknown>, key: string) {
  const value = stringField(body, key, 36, 36);
  if (!uuid.test(value)) throw new AppError('input_invalid', 400, 'Confira os dados informados.');
  return value;
}

export async function listMfaFactors() {
  await requireIdentity();
  const client = await createAuthClient();
  const { data, error } = await client.auth.mfa.listFactors();
  if (error) throw new AppError('mfa_failed', 400, 'Não foi possível consultar a verificação em duas etapas.');
  return Response.json({ factors: data.totp.map(factor => ({ id: factor.id, name: factor.friendly_name })) });
}

export async function processMfa(request: Request) {
  const body = await readJsonObject(request);
  const identity = await requireIdentity();
  const action = stringField(body, 'action', 1, 20);
  const client = await createAuthClient();
  if (action === 'enroll') {
    const factors = await client.auth.mfa.listFactors();
    if (factors.error) throw new AppError('mfa_failed', 400, 'Não foi possível preparar a verificação em duas etapas.');
    // Recomeçar troca só a configuração incompleta deste aplicativo.
    // Fatores já confirmados e fatores de outros nomes permanecem intactos.
    for (const factor of factors.data.all) {
      if (factor.factor_type !== 'totp' || factor.status !== 'unverified' ||
          factor.friendly_name !== 'Meu Mimo') continue;
      const { error } = await client.auth.mfa.unenroll({ factorId: factor.id });
      if (error) throw new AppError('mfa_failed', 400, 'Não foi possível recomeçar esta configuração. Tente novamente.');
    }
    const { data, error } = await client.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Meu Mimo' });
    if (error || !data || data.type !== 'totp') {
      throw new AppError('mfa_failed', 400, 'Não foi possível preparar a verificação em duas etapas.');
    }
    await auditEvent('AUTH_MFA_ENROLLMENT', identity.userId);
    return Response.json({ factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret, uri: data.totp.uri });
  }
  const factorId = factorField(body, 'factorId');
  if (action === 'challenge') {
    const { data, error } = await client.auth.mfa.challenge({ factorId });
    if (error || !data) throw new AppError('mfa_failed', 400, 'Não foi possível iniciar esta verificação.');
    return Response.json({ challengeId: data.id });
  }
  if (action === 'verify') {
    const challengeId = factorField(body, 'challengeId');
    const code = stringField(body, 'code', 6, 6);
    if (!/^\d{6}$/.test(code)) throw new AppError('input_invalid', 400, 'Digite os seis números do aplicativo.');
    const { error } = await client.auth.mfa.verify({ factorId, challengeId, code });
    if (error) throw new AppError('mfa_failed', 400, 'Não foi possível confirmar esse código. Tente novamente.');
    const verified = await readVerifiedIdentity(client);
    if (verified.userId !== identity.userId || verified.assuranceLevel !== 'aal2') {
      throw new AppError('mfa_required', 403, 'Confirme sua verificação em duas etapas.');
    }
    await registerAuthSession(verified.sessionId, verified.userId);
    await auditEvent('AUTH_MFA_VERIFIED', identity.userId);
    return Response.json({ assuranceLevel: 'aal2' });
  }
  throw new AppError('input_invalid', 400, 'Escolha uma ação válida.');
}
