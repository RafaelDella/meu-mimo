import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { assertLocalDatabase, statePath, supabase, taskResources, webRoot } from './local-runtime.mjs';
import { bindLocalStack } from './bind-local-stack.mjs';
import { configureAuthCallbacks } from './configure-auth.mjs';

const resources = taskResources(process.argv[2] ?? 't02');
mkdirSync(resources.directory, { recursive: true });
await bindLocalStack();
await configureAuthCallbacks();
const status = JSON.parse(supabase(['status', '-o', 'json']));
const adminURL = status.DB_URL;
assertLocalDatabase(adminURL, 'postgres');
if (status.API_URL !== 'http://127.0.0.1:54321') throw new Error('A stack não usa a API reservada de T02.');
const previous = existsSync(resources.statePath) ? JSON.parse(readFileSync(resources.statePath, 'utf8')) : null;
const shared = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : previous;
const password = shared?.runtimePassword ?? randomBytes(32).toString('hex');
const rateSecret = shared?.runtime.AUTH_RATE_LIMIT_SECRET ?? randomBytes(32).toString('hex');
const database = new pg.Client({ connectionString: adminURL });
await database.connect();
try {
  for (const name of new Set([resources.database, resources.development, resources.shadow])) {
    const found = await database.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
    if (!found.rowCount) await database.query(`CREATE DATABASE "${name}"`);
  }
  const role = await database.query('SELECT rolsuper, rolcreatedb, rolcreaterole, rolbypassrls FROM pg_roles WHERE rolname = $1', ['meumimo_runtime']);
  if (role.rowCount && Object.values(role.rows[0]).some(Boolean)) throw new Error('O papel de runtime existente tem privilégios inesperados.');
  const statement = role.rowCount ?
    await database.query("SELECT format('ALTER ROLE meumimo_runtime LOGIN PASSWORD %L', $1::text) AS sql", [password]) :
    await database.query("SELECT format('CREATE ROLE meumimo_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS PASSWORD %L', $1::text) AS sql", [password]);
  await database.query(statement.rows[0].sql);
} finally { await database.end(); }

function urlFor(name, runtime = false) {
  const url = new URL(adminURL);
  url.pathname = `/${name}`;
  url.searchParams.set('schema', 'app');
  if (runtime) { url.username = 'meumimo_runtime'; url.password = password; }
  return url.toString();
}
const runtime = {
  APP_ORIGIN: `http://127.0.0.1:${resources.port}`, SUPABASE_URL: status.API_URL,
  SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY ?? status.ANON_KEY,
  DATABASE_URL: urlFor(resources.database, true), AUTH_RATE_LIMIT_SECRET: rateSecret,
  ...(['t06', 't07', 't08', 't09', 't10', 't11', 't12', 't13'].includes(resources.task) ? { MEDIA_GATEWAY_URL: 'http://127.0.0.1:4311',
    MEDIA_INTERNAL_SECRET: previous?.runtime.MEDIA_INTERNAL_SECRET ?? randomBytes(32).toString('hex') } : {}),
};
const integration = {
  T02_PROJECT_ID: 'meumimo-t02', T02_TEST_ORIGIN: runtime.APP_ORIGIN,
  T02_DATABASE_URL: resources.task === 't02' ? adminURL : urlFor(resources.database),
  T02_AUTH_DATABASE_URL: adminURL, T02_TASK: resources.task, T02_MAIL_URL: 'http://127.0.0.1:54324',
  SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
  SUPABASE_URL: runtime.SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY: runtime.SUPABASE_PUBLISHABLE_KEY,
  ...(status.JWT_SECRET ? { T02_JWT_SECRET: status.JWT_SECRET } : {}),
};
if (!runtime.SUPABASE_PUBLISHABLE_KEY || !integration.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Credenciais locais não foram encontradas.');
const migration = { integration: urlFor(resources.database), development: urlFor(resources.development), shadow: urlFor(resources.shadow) };
writeFileSync(resources.statePath, JSON.stringify({ runtime, integration, migration, runtimePassword: password }, null, 2), { mode: 0o600 });
writeFileSync(path.join(resources.directory, 'supabase-status.json'), JSON.stringify(status), { mode: 0o600 });
const developmentRuntime = { ...runtime, APP_ORIGIN: 'http://127.0.0.1:4301', DATABASE_URL: urlFor(resources.development, true) };
const localEnv = path.join(webRoot, '.env.local');
const generatedMarker = '# Gerado por local:prepare; remova esta linha para gerenciar manualmente.\n';
if (!existsSync(localEnv) || readFileSync(localEnv, 'utf8').startsWith(generatedMarker)) {
  writeFileSync(localEnv, generatedMarker + Object.entries(developmentRuntime).map(([key, value]) => `${key}=${value}`).join('\n') + '\n', { mode: 0o600 });
}
process.stdout.write('Bancos e papel local preparados. Segredos mantidos fora do Git; nenhum dado real foi migrado.\n');
