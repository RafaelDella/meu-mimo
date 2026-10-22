import './only.ts';
import { AppError } from './errors.ts';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new AppError('service_unavailable', 503, 'O serviço de conta ainda não está configurado.');
  return value;
}

export function getServerEnv() {
  const appOrigin = required('APP_ORIGIN');
  const supabaseUrl = required('SUPABASE_URL');
  const databaseUrl = required('DATABASE_URL');
  const supabasePublishableKey = required('SUPABASE_PUBLISHABLE_KEY');
  const rateLimitSecret = required('AUTH_RATE_LIMIT_SECRET');
  try {
    const app = new URL(appOrigin);
    const auth = new URL(supabaseUrl);
    const db = new URL(databaseUrl);
    if (!['http:', 'https:'].includes(app.protocol) || app.origin !== appOrigin ||
        !['http:', 'https:'].includes(auth.protocol) ||
        !['postgres:', 'postgresql:'].includes(db.protocol) || rateLimitSecret.length < 32) {
      throw new Error('Configuração inválida.');
    }
    if (!supabasePublishableKey.startsWith('sb_publishable_')) {
      const claims = JSON.parse(Buffer.from(supabasePublishableKey.split('.')[1] ?? '', 'base64url').toString('utf8'));
      if (claims.role !== 'anon') throw new Error('A chave de Auth deve ser pública.');
    }
  } catch {
    throw new AppError('service_unavailable', 503, 'A configuração do serviço de conta precisa ser conferida.');
  }
  return { appOrigin, supabaseUrl, databaseUrl, supabasePublishableKey, rateLimitSecret };
}
