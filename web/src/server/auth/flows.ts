import '../only.ts';
import { AppError } from '../errors.ts';
import { getServerEnv } from '../env.ts';
import { optionalStringField, readJsonObject, stringField, validatedEmail } from '../http.ts';
import { auditEvent } from '../audit/events.ts';
import { clearAuthCookies, createAuthClient, createAuthFlow } from './client.ts';
import { requireAuthFlowContext } from './flow-context.ts';
import { readVerifiedIdentity, requireIdentity } from './session.ts';
import { consumeAuthLimit } from './rate-limit.ts';
import { completeRecoverySession, readAuthSession, registerAuthSession, revokeAuthSession } from './sessions.ts';
import { safeReturnPath } from './return-path.ts';

const neutralMessage = 'Se os dados estiverem corretos, confira seu e-mail.';

function callbackURL(returnTo: string, recovery = false) {
  const url = new URL('/api/auth/callback', getServerEnv().appOrigin);
  url.searchParams.set('returnTo', returnTo);
  if (recovery) url.searchParams.set('flow', 'recovery');
  return url.toString();
}

export async function signup(request: Request) {
  const body = await readJsonObject(request);
  const email = validatedEmail(body);
  const password = stringField(body, 'password', 8, 256);
  const returnTo = safeReturnPath(optionalStringField(body, 'returnTo', 2048));
  const { client, sealContext } = await createAuthFlow('signup');
  const { error } = await client.auth.signUp({
    email, password, options: { emailRedirectTo: callbackURL(returnTo) },
  });
  // Erros do provedor não revelam se há uma conta para este endereço.
  if (error && error.status && error.status >= 500) {
    throw new AppError('auth_unavailable', 503, 'Não foi possível continuar agora. Tente novamente.');
  }
  await sealContext();
  await auditEvent('AUTH_SIGNUP_REQUESTED');
  return Response.json({ message: neutralMessage }, { status: 202 });
}

export async function login(request: Request) {
  const body = await readJsonObject(request);
  const email = validatedEmail(body);
  const password = stringField(body, 'password', 1, 256);
  await consumeAuthLimit('login', email, getServerEnv().appOrigin);
  const client = await createAuthClient();
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) {
    throw new AppError('login_failed', 401, 'Não foi possível entrar com esses dados.');
  }
  const identity = await readVerifiedIdentity(client);
  await registerAuthSession(identity.sessionId, identity.userId);
  await auditEvent('AUTH_LOGIN', identity.userId);
  return Response.json({ returnTo: safeReturnPath(optionalStringField(body, 'returnTo', 2048)) });
}

export async function callback(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const flowId = url.searchParams.get('sb_flow_id');
  if (!code || code.length > 4096 || (flowId !== null && !/^[a-zA-Z0-9_-]{8,64}$/.test(flowId))) {
    throw new AppError('callback_invalid', 400, 'Este link não pôde ser confirmado. Solicite outro.');
  }
  const purpose = await requireAuthFlowContext(flowId);
  const client = await createAuthClient();
  const { data, error } = await client.auth.exchangeCodeForSession(code,
    flowId === null ? undefined : { flowId });
  if (error || !data.session || !data.user) {
    throw new AppError('callback_invalid', 400, 'Este link não pôde ser confirmado. Solicite outro.');
  }
  const identity = await readVerifiedIdentity(client);
  const { data: verified, error: claimsError } = await client.auth.getClaims(data.session.access_token);
  const claims = verified?.claims;
  const methods = Array.isArray(claims?.amr)
    ? claims.amr.map(entry => typeof entry === 'string' ? entry : entry?.method) : [];
  const expectedMethod = purpose === 'recovery' ? 'recovery' : 'email/signup';
  // A finalidade também deve coincidir com o método assinado pelo provedor, não só com o cookie.
  if (claimsError || claims?.sub !== identity.userId || claims?.session_id !== identity.sessionId ||
      methods.length === 0 || methods.some(method => method !== expectedMethod)) {
    throw new AppError('callback_invalid', 400, 'Este link não pôde ser confirmado. Solicite outro.');
  }
  const recovery = purpose === 'recovery';
  await registerAuthSession(identity.sessionId, identity.userId, recovery);
  await auditEvent(recovery ? 'AUTH_RECOVERY_CONFIRMED' : 'AUTH_EMAIL_CONFIRMED', identity.userId);
  const returnTo = recovery ? '/conta?recuperacao=1' : safeReturnPath(url.searchParams.get('returnTo'));
  return new Response(null, {
    status: 303, headers: { Location: new URL(returnTo, getServerEnv().appOrigin).toString() },
  });
}

export async function requestRecovery(request: Request) {
  const body = await readJsonObject(request);
  const email = validatedEmail(body);
  await consumeAuthLimit('recovery', email, getServerEnv().appOrigin);
  const { client, sealContext } = await createAuthFlow('recovery');
  const { error } = await client.auth.resetPasswordForEmail(email, {
    redirectTo: callbackURL('/conta', true),
  });
  if (error && error.status && error.status >= 500) {
    throw new AppError('auth_unavailable', 503, 'Não foi possível continuar agora. Tente novamente.');
  }
  await sealContext();
  await auditEvent('AUTH_RECOVERY_REQUESTED');
  return Response.json({ message: neutralMessage }, { status: 202 });
}

export async function finishRecovery(request: Request) {
  const body = await readJsonObject(request);
  const password = stringField(body, 'password', 8, 256);
  const identity = await requireIdentity({ allowRecovery: true });
  const session = await readAuthSession(identity.sessionId, identity.userId);
  if (!session.recovery) throw new AppError('recovery_required', 403, 'Use um link de recuperação válido.');
  const client = await createAuthClient();
  const { error } = await client.auth.updateUser({ password });
  if (error) throw new AppError('password_update_failed', 400, 'Não foi possível atualizar sua senha.');
  await completeRecoverySession(identity.sessionId, identity.userId);
  await auditEvent('AUTH_PASSWORD_CHANGED', identity.userId);
  return Response.json({ message: 'Sua senha foi atualizada.' });
}

export async function logout(request: Request) {
  await readJsonObject(request);
  const client = await createAuthClient();
  try {
    const identity = await readVerifiedIdentity(client);
    await revokeAuthSession(identity.sessionId, identity.userId);
    await auditEvent('AUTH_LOGOUT', identity.userId);
  } catch (error) {
    if (!(error instanceof AppError) || error.status !== 401) throw error;
  }
  try {
    await client.auth.signOut({ scope: 'local' });
  } finally {
    await clearAuthCookies();
  }
  return Response.json({ message: 'Você saiu da sua conta.' });
}
