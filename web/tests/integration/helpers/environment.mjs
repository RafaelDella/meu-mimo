import assert from 'node:assert/strict';
import { assertLocalDatabase } from '../../../scripts/local-runtime.mjs';

export function required(name) {
  const value = process.env[name];
  assert.ok(value, `Defina ${name} para executar a integração real de T02.`);
  return value;
}

function localURL(value, port) {
  const url = new URL(value);
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname), 'Use somente o ambiente local de T02.');
  assert.equal(url.port, String(port), `A integração exige a porta local ${port}.`);
  assert.equal(url.protocol, 'http:');
  assert.equal(url.username, '');
  assert.equal(url.password, '');
  return url.origin;
}

export function integrationEnvironment() {
  const origin = localURL(required('T02_TEST_ORIGIN'), 4302);
  const supabaseURL = localURL(required('SUPABASE_URL'), 54321);
  const mailURL = localURL(required('T02_MAIL_URL'), 54324);
  const databaseURL = required('T02_DATABASE_URL');
  assertLocalDatabase(databaseURL, 'postgres');
  const database = new URL(databaseURL);
  assert.ok(['postgres:', 'postgresql:'].includes(database.protocol));
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(database.hostname));
  assert.equal(database.port, '54322');
  assert.equal(database.pathname, '/postgres', 'Use o banco da stack exclusiva meumimo-t02.');
  assert.equal(required('T02_PROJECT_ID'), 'meumimo-t02', 'Identifique explicitamente a stack descartável.');
  return {
    origin, supabaseURL, mailURL, databaseURL,
    serviceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY'),
    publishableKey: required('SUPABASE_PUBLISHABLE_KEY'),
  };
}
