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
  const task = process.env.T02_TASK ?? 't02';
  assert.ok(['t02', 't04', 't05', 't06'].includes(task));
  const origin = localURL(required('T02_TEST_ORIGIN'), task === 't02' ? 4302 : 4310);
  const supabaseURL = localURL(required('SUPABASE_URL'), 54321);
  const mailURL = localURL(required('T02_MAIL_URL'), 54324);
  const databaseURL = required('T02_DATABASE_URL');
  assertLocalDatabase(databaseURL, task === 't02' ? 'postgres' : `meumimo_${task}`);
  const database = new URL(databaseURL);
  assert.ok(['postgres:', 'postgresql:'].includes(database.protocol));
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(database.hostname));
  assert.equal(database.port, '54322');
  assert.equal(database.pathname, task === 't02' ? '/postgres' : `/meumimo_${task}`);
  const authDatabaseURL = process.env.T02_AUTH_DATABASE_URL ?? databaseURL;
  assertLocalDatabase(authDatabaseURL, 'postgres');
  assert.equal(required('T02_PROJECT_ID'), 'meumimo-t02', 'Identifique explicitamente a stack descartável.');
  return {
    origin, supabaseURL, mailURL, databaseURL, authDatabaseURL, task,
    serviceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY'),
    publishableKey: required('SUPABASE_PUBLISHABLE_KEY'),
  };
}
