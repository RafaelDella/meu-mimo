import '../only.ts';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getServerEnv } from '../env.ts';
import { AUTH_COOKIE_NAME, flowContextCookieName, isVerifierCookie, sealAuthFlowContexts } from './flow-context.ts';
import type { AuthFlowPurpose } from './flow-context.ts';

export { AUTH_COOKIE_NAME } from './flow-context.ts';

async function buildAuthClient(verifiers?: Map<string, string>) {
  const environment = getServerEnv();
  const cookieStore = await cookies();
  return createServerClient(environment.supabaseUrl, environment.supabasePublishableKey, {
    cookieOptions: {
      name: AUTH_COOKIE_NAME,
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: new URL(environment.appOrigin).protocol === 'https:',
    },
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: cookiesToSet => {
        for (const { name, value, options } of cookiesToSet) {
          cookieStore.set(name, value, { ...options, httpOnly: true, sameSite: 'lax' });
          if (!isVerifierCookie(name)) continue;
          if (value && options.maxAge !== 0) {
            verifiers?.set(name, value);
          } else {
            verifiers?.delete(name);
            cookieStore.delete(flowContextCookieName(name));
          }
        }
      },
    },
  });
}

export async function createAuthClient() {
  return buildAuthClient();
}

export async function createAuthFlow(purpose: AuthFlowPurpose) {
  const verifiers = new Map<string, string>();
  return {
    client: await buildAuthClient(verifiers),
    sealContext: () => sealAuthFlowContexts(verifiers, purpose),
  };
}

export type AuthClient = Awaited<ReturnType<typeof createAuthClient>>;

export async function clearAuthCookies() {
  const cookieStore = await cookies();
  for (const { name } of cookieStore.getAll()) {
    if (name === AUTH_COOKIE_NAME || name.startsWith(`${AUTH_COOKIE_NAME}.`) ||
        name.startsWith(`${AUTH_COOKIE_NAME}-`)) cookieStore.delete(name);
  }
}
