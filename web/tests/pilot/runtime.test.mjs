import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pilotResources } from '../../scripts/pilot/resources.mjs';
import { runtimeEnvironment, assertPilotRuntime } from '../../scripts/pilot/runtime-environment.mjs';
import { localMediaTarget } from '../../src/server/media/local-target.ts';

function environment(mode) {
  const resource = pilotResources(mode);
  return { PILOT_MODE: mode, PILOT_PROJECT_ID: resource.project, PILOT_DIRECTORY: resource.directory,
    APP_ORIGIN: `http://127.0.0.1:${resource.nextPort}`, SUPABASE_URL: `http://127.0.0.1:${resource.apiPort}`,
    DATABASE_URL: `postgresql://meumimo_runtime@127.0.0.1:${resource.dbPort}/${resource.database}?schema=app`,
    MEDIA_GATEWAY_URL: `http://127.0.0.1:${resource.mediaPort}`, MEDIA_PREFIX: resource.mediaPrefix,
    MEDIA_TEMP_DIR: path.join(resource.directory, 'temp', ...(mode === 'restore' ? [] : [mode])) };
}

test('tuplas de mídia nominais não misturam origem e restore', () => {
  for (const mode of ['development', 'integration', 'restore']) {
    const value = environment(mode); const target = localMediaTarget(value);
    assert.equal(target.port, mode === 'restore' ? 4321 : 4311);
    assert.equal(target.prefix, `t14-${mode}`); assert.doesNotThrow(() => assertPilotRuntime(value, mode));
    for (const change of [{ SUPABASE_URL: 'http://127.0.0.1:54320' }, { MEDIA_GATEWAY_URL: 'http://127.0.0.1:4312' },
      { PILOT_PROJECT_ID: 'outro' }, { MEDIA_PREFIX: 't14-development-trocado' }]) {
      assert.throws(() => localMediaTarget({ ...value, ...change }));
    }
  }
});

test('modo anterior preserva a porta e recusa flags de restore', () => {
  const value = { APP_ORIGIN: 'http://127.0.0.1:4310', SUPABASE_URL: 'http://127.0.0.1:54321',
    DATABASE_URL: 'postgresql://meumimo_runtime@127.0.0.1:54322/meumimo_t13?schema=app', MEDIA_GATEWAY_URL: 'http://127.0.0.1:4311' };
  assert.equal(localMediaTarget(value).port, 4311);
  assert.throws(() => localMediaTarget({ ...value, PILOT_MODE: 'restore' }));
});

test('ambiente Next remove credenciais operacionais inclusive de um runtime malformado', () => {
  const value = environment('integration'); const secret = 'segredo-sintetico-fora-do-next';
  const result = runtimeEnvironment({ ...value, SUPABASE_PUBLISHABLE_KEY: 'chave-publica-sintetica', SUPABASE_SERVICE_ROLE_KEY: secret },
    { SUPABASE_SERVICE_ROLE_KEY: secret, T14_DATABASE_URL: secret, MIGRATION_DATABASE_URL: secret,
      MEDIA_BUCKET: secret, PILOT_INVENTORY: secret, FFMPEG_PATH: secret, PATH: 'caminho-sintetico' });
  assert.equal(JSON.stringify(result).includes(secret), false); assert.equal(result.PATH, 'caminho-sintetico');
  assert.equal(result.SUPABASE_PUBLISHABLE_KEY, 'chave-publica-sintetica'); assert.equal(result.DATABASE_URL, value.DATABASE_URL);
});

test('ambiente de aplicação não admite conexão de migração na mesma base nominal', () => {
  const value = environment('integration'); value.DATABASE_URL = value.DATABASE_URL.replace('meumimo_runtime@', 'postgres@');
  assert.throws(() => assertPilotRuntime(value, 'integration'));
  assert.throws(() => localMediaTarget(value));
});
