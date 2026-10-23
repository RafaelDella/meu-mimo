import { createHmac, randomBytes } from 'node:crypto';
import { environment } from './backup-source.mjs';

const project = 'meumimo-t14-restore';
export const restoreName = service => `supabase_${service}_${project}`;
export const restoreNetwork = `supabase_network_${project}`;

export function newRestoreSecrets() {
  const jwt = randomBytes(48).toString('hex'); const now = Math.floor(Date.now() / 1000);
  const token = role => {
    const first = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const second = Buffer.from(JSON.stringify({ iss: 'supabase', ref: project, role, iat: now, exp: now + 365 * 86400 })).toString('base64url');
    return `${first}.${second}.${createHmac('sha256', jwt).update(`${first}.${second}`).digest('base64url')}`;
  };
  return { jwt, anon: token('anon'), service: token('service_role'), postgres: randomBytes(32).toString('hex'),
    runtime: randomBytes(32).toString('hex'), gateway: randomBytes(32).toString('hex'),
    authRate: randomBytes(32).toString('hex'), s3Id: randomBytes(16).toString('hex'), s3Secret: randomBytes(32).toString('hex'),
    realtime: randomBytes(64).toString('hex'), passwords: {} };
}

const urlKeys = new Set(['GOTRUE_DB_DATABASE_URL', 'DATABASE_URL', 'PGRST_DB_URI']);
const hostKeys = new Set(['GOTRUE_SMTP_HOST', 'DB_HOST', 'POSTGRES_HOST']);
export function restoredEnvironment(service, config, secrets) {
  const source = environment({ Config: config }); const result = { ...source };
  for (const [key, value] of Object.entries(result)) {
    if (urlKeys.has(key)) {
      const url = new URL(value);
      if (!['postgres:', 'postgresql:'].includes(url.protocol) || !/^supabase_db_meumimo-t02$/.test(url.hostname)) throw new Error('Conexão interna não reconhecida.');
      url.hostname = restoreName('db'); url.password = secrets.passwords[url.username] ?? secrets.postgres;
      result[key] = url.toString();
    } else if (hostKeys.has(key) && value.startsWith('supabase_')) {
      const matched = /^supabase_(db|inbucket)_meumimo-t02$/.exec(value);
      if (!matched) throw new Error('Host interno não reconhecido.');
      result[key] = restoreName(matched[1]);
    }
  }
  for (const key of ['JWT_SECRET', 'GOTRUE_JWT_SECRET', 'AUTH_JWT_SECRET', 'PGRST_JWT_SECRET', 'API_JWT_SECRET', 'METRICS_JWT_SECRET']) {
    if (key in result) result[key] = secrets.jwt;
  }
  for (const key of ['JWT_JWKS', 'API_JWT_JWKS', 'GOTRUE_JWT_KEYS']) delete result[key];
  for (const key of ['POSTGRES_PASSWORD', 'PGPASSWORD', 'DB_PASSWORD']) if (key in result) result[key] = secrets.postgres;
  if (result.DB_USER && 'DB_PASSWORD' in result) result.DB_PASSWORD = secrets.passwords[result.DB_USER] ?? secrets.postgres;
  for (const key of Object.keys(result)) {
    if (/^GOTRUE_EXTERNAL_[A-Z0-9_]+_REDIRECT_URI$/.test(key) && result[key]) result[key] = 'http://127.0.0.1:55321/auth/v1/callback';
  }
  if (service === 'auth') Object.assign(result, {
    GOTRUE_JWT_SECRET: secrets.jwt, GOTRUE_API_EXTERNAL_URL: 'http://127.0.0.1:55321',
    API_EXTERNAL_URL: 'http://127.0.0.1:55321', GOTRUE_SITE_URL: 'http://127.0.0.1:4320',
    GOTRUE_URI_ALLOW_LIST: 'http://127.0.0.1:4320/**', GOTRUE_SMTP_HOST: restoreName('inbucket'),
  });
  if (service === 'storage') Object.assign(result, {
    ANON_KEY: secrets.anon, SERVICE_KEY: secrets.service, AUTH_JWT_SECRET: secrets.jwt,
    S3_PROTOCOL_ACCESS_KEY_ID: secrets.s3Id, S3_PROTOCOL_ACCESS_KEY_SECRET: secrets.s3Secret,
    ENABLE_IMAGE_TRANSFORMATION: 'false', IMAGE_TRANSFORMATION_ENABLED: 'false', IMGPROXY_URL: '',
  });
  if (service === 'realtime') result.SECRET_KEY_BASE = secrets.realtime;
  if (service === 'kong') {
    result.KONG_PLUGINS = 'request-transformer,cors,key-auth';
    delete result.KONG_SSL_CERT; delete result.KONG_SSL_CERT_KEY;
    result.KONG_SSL_LISTEN = 'off'; result.KONG_DECLARATIVE_CONFIG = '/home/kong/kong.yml';
    result.KONG_PORT_MAPS = '55321:8000';
  }
  if (Object.values(result).some(value => value.includes('_meumimo-t02'))) throw new Error('Uma referência da origem permaneceu na configuração.');
  return Object.entries(result).map(([key, value]) => `${key}=${value}`);
}

export function kongConfiguration(secrets) {
  const plugin = '    plugins:\n      - name: cors\n      - name: key-auth\n        config:\n          key_names: [apikey]\n          hide_credentials: false\n';
  let value = '_format_version: "2.1"\n_transform: true\nconsumers:\n';
  for (const [username, key] of [['anon', secrets.anon], ['service_role', secrets.service]]) {
    value += `  - username: ${username}\n    keyauth_credentials:\n      - key: ${key}\n`;
  }
  value += 'services:\n';
  for (const [name, port, route] of [['auth', 9999, 'auth'], ['rest', 3000, 'rest'], ['storage', 5000, 'storage']]) {
    value += `  - name: ${name}-v1\n    url: http://${restoreName(name)}:${port}/\n    routes:\n      - name: ${name}-v1\n        strip_path: true\n        paths: [/${route}/v1/]\n${plugin}`;
  }
  for (const action of ['verify', 'callback', 'authorize']) {
    value += `  - name: auth-${action}\n    url: http://${restoreName('auth')}:9999/${action}\n    routes:\n      - name: auth-${action}\n        strip_path: true\n        paths: [/auth/v1/${action}]\n    plugins:\n      - name: cors\n`;
  }
  return value;
}
