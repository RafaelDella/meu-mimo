export class AccountRequestError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'AccountRequestError';
    this.code = code;
  }
}

export async function accountRequest(
  path: string,
  method = 'GET',
  body?: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  const response = await fetch(`/api/auth/${path}`, {
    method,
    cache: 'no-store',
    credentials: 'same-origin',
    signal,
    ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
  });
  const value: unknown = await response.json();
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Não foi possível continuar agora. Tente novamente.');
  }
  const result: Record<string, unknown> = { ...value };
  if (!response.ok) {
    const code = typeof result.code === 'string' ? result.code : 'request_failed';
    const message = typeof result.message === 'string' ? result.message : 'Não foi possível continuar agora. Tente novamente.';
    throw new AccountRequestError(code, message);
  }
  return result;
}

export type AccountSession = {
  userId: string;
  sessionId: string;
  assuranceLevel: 'aal1' | 'aal2';
  recovery: boolean;
};

export function accountSession(value: Record<string, unknown>): AccountSession {
  if (typeof value.userId !== 'string' || typeof value.sessionId !== 'string' ||
      (value.assuranceLevel !== 'aal1' && value.assuranceLevel !== 'aal2') ||
      typeof value.recovery !== 'boolean') {
    throw new Error('Não foi possível confirmar sua conta agora. Tente novamente.');
  }
  return {
    userId: value.userId, sessionId: value.sessionId,
    assuranceLevel: value.assuranceLevel, recovery: value.recovery,
  };
}

export function friendlyError(error: unknown) {
  return error instanceof AccountRequestError ? error.message : 'Não foi possível continuar agora. Tente novamente.';
}

export function notifySessionChanged() {
  window.dispatchEvent(new Event('meumimo:session-changed'));
  if (typeof BroadcastChannel !== 'undefined') {
    const channel = new BroadcastChannel('meumimo-session');
    channel.postMessage('changed');
    channel.close();
  }
}
