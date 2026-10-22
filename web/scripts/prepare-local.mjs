import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { artifactRoot, assertLocalDatabase, statePath, supabase, webRoot } from './local-runtime.mjs';
import { bindLocalStack } from './bind-local-stack.mjs';

await bindLocalStack();
const status = JSON.parse(supabase(['status', '-o', 'json']));
const adminURL = status.DB_URL;
assertLocalDatabase(adminURL, 'postgres');
if (status.API_URL !== 'http://127.0.0.1:54321') throw new Error('A stack não usa a API reservada de T02.');
const previous = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : null;
const password = previous?.runtimePassword ?? randomBytes(32).toString('hex');
const rateSecret = previous?.runtime.AUTH_RATE_LIMIT_SECRET ?? randomBytes(32).toString('hex');
const database = new pg.Client({ connectionString: adminURL });
await database.connect();
try {
  for (const name of ['meumimo_t02_dev', 'meumimo_t02_shadow']) {
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
  APP_ORIGIN: 'http://127.0.0.1:4302', SUPABASE_URL: status.API_URL,
  SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY ?? status.ANON_KEY,
  DATABASE_URL: urlFor('postgres', true), AUTH_RATE_LIMIT_SECRET: rateSecret,
};
const integration = {
  T02_PROJECT_ID: 'meumimo-t02', T02_TEST_ORIGIN: runtime.APP_ORIGIN,
  T02_DATABASE_URL: adminURL, T02_MAIL_URL: 'http://127.0.0.1:54324',
  SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
  SUPABASE_URL: runtime.SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY: runtime.SUPABASE_PUBLISHABLE_KEY,
  ...(status.JWT_SECRET ? { T02_JWT_SECRET: status.JWT_SECRET } : {}),
};
if (!runtime.SUPABASE_PUBLISHABLE_KEY || !integration.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Credenciais locais não foram encontradas.');
const migration = { integration: urlFor('postgres'), development: urlFor('meumimo_t02_dev'), shadow: urlFor('meumimo_t02_shadow') };
writeFileSync(statePath, JSON.stringify({ runtime, integration, migration, runtimePassword: password }, null, 2), { mode: 0o600 });
writeFileSync(path.join(artifactRoot, 'supabase-status.json'), JSON.stringify(status), { mode: 0o600 });
const developmentRuntime = { ...runtime, APP_ORIGIN: 'http://127.0.0.1:4301', DATABASE_URL: urlFor('meumimo_t02_dev', true) };
const localEnv = path.join(webRoot, '.env.local');
const generatedMarker = '# Gerado por local:prepare; remova esta linha para gerenciar manualmente.\n';
if (!existsSync(localEnv) || readFileSync(localEnv, 'utf8').startsWith(generatedMarker)) {
  writeFileSync(localEnv, generatedMarker + Object.entries(developmentRuntime).map(([key, value]) => `${key}=${value}`).join('\n') + '\n', { mode: 0o600 });
}
process.stdout.write('Bancos e papel local preparados. Segredos mantidos fora do Git; nenhum dado real foi migrado.\n');
