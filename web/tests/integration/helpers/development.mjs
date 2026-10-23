import assert from 'node:assert/strict';
import { readState } from '../../../scripts/local-runtime.mjs';
import { pilotResources } from '../../../scripts/pilot/resources.mjs';
import { assertPilotDatabase, pilotRuntimeEnvironment } from '../../../scripts/pilot/runtime-environment.mjs';

/** Somente QA explícito da aplicação de desenvolvimento; não é configuração de produto. */
export function developmentEnvironment() {
  const state = readState('t14'); const resources = pilotResources('development');
  const runtime = pilotRuntimeEnvironment(state, 'development');
  assertPilotDatabase(state.migration.development, 'development');
  assertPilotDatabase(state.integration.T02_AUTH_DATABASE_URL, 'development', 'auth');
  assert.equal(runtime.APP_ORIGIN, 'http://127.0.0.1:4301');
  assert.equal(resources.database, 'meumimo_t14_dev');
  assert.equal(state.integration.T02_PROJECT_ID, 'meumimo-t02');
  return { origin: runtime.APP_ORIGIN, supabaseURL: runtime.SUPABASE_URL, mailURL: 'http://127.0.0.1:54324',
    databaseURL: state.migration.development, authDatabaseURL: state.integration.T02_AUTH_DATABASE_URL, task: 't14',
    serviceRoleKey: state.integration.SUPABASE_SERVICE_ROLE_KEY, publishableKey: runtime.SUPABASE_PUBLISHABLE_KEY };
}
