import path from 'node:path';
import { pilotResources } from './resources.mjs';

const runtimeKeys = ['APP_ORIGIN', 'SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'DATABASE_URL',
  'AUTH_RATE_LIMIT_SECRET', 'MEDIA_GATEWAY_URL', 'MEDIA_INTERNAL_SECRET', 'PILOT_MODE', 'PILOT_PROJECT_ID', 'PILOT_DIRECTORY'];

export function runtimeEnvironment(runtime, base = process.env) {
  const result = Object.fromEntries(Object.entries(base).filter(([key]) =>
    !/^(T(?:0[2456789]|1[0-4])_|SUPABASE_|MEDIA_|FFMPEG_|FFPROBE_|MIGRATION_|SHADOW_|PILOT_|DATABASE_URL$|AUTH_RATE_LIMIT_SECRET$|APP_ORIGIN$)/i.test(key)));
  for (const key of runtimeKeys) if (runtime[key] !== undefined) result[key] = runtime[key];
  return result;
}

export function assertPilotDatabase(value, mode, kind = 'runtime') {
  const resources = pilotResources(mode);
  if (!['runtime', 'auth'].includes(kind)) throw new Error('Tipo de banco do piloto inválido.');
  const url = new URL(value);
  const database = kind === 'auth' ? 'postgres' : resources.database;
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hostname !== '127.0.0.1' ||
      url.port !== String(resources.dbPort) || url.pathname !== `/${database}` || url.hash ||
      [...url.searchParams].length > 1 || [...url.searchParams].some(([key, value]) => key !== 'schema' || value !== 'app')) {
    throw new Error('O comando aceita somente o banco nominal do piloto local.');
  }
}

export function assertPilotRuntime(runtime, mode) {
  const resources = pilotResources(mode);
  assertPilotDatabase(runtime.DATABASE_URL, mode);
  if (new URL(runtime.DATABASE_URL).username !== 'meumimo_runtime' ||
      runtime.PILOT_MODE !== mode || runtime.PILOT_PROJECT_ID !== resources.project ||
      runtime.PILOT_DIRECTORY !== resources.directory || runtime.APP_ORIGIN !== `http://127.0.0.1:${resources.nextPort}` ||
      runtime.SUPABASE_URL !== `http://127.0.0.1:${resources.apiPort}` ||
      runtime.MEDIA_GATEWAY_URL !== `http://127.0.0.1:${resources.mediaPort}` ||
      (runtime.MEDIA_PREFIX !== undefined && runtime.MEDIA_PREFIX !== resources.mediaPrefix) ||
      (runtime.MEDIA_TEMP_DIR !== undefined && runtime.MEDIA_TEMP_DIR !== path.join(resources.directory, 'temp', ...(mode === 'restore' ? [] : [mode])))) {
    throw new Error('Ambiente do piloto mistura recursos de modos diferentes.');
  }
  return resources;
}

export function pilotRuntimeEnvironment(state, mode) {
  const resources = pilotResources(mode);
  const runtime = Object.fromEntries(runtimeKeys.filter(key => state.runtime[key] !== undefined).map(key => [key, state.runtime[key]]));
  if (mode === 'development') {
    const database = new URL(runtime.DATABASE_URL);
    database.pathname = `/${resources.database}`;
    runtime.DATABASE_URL = database.toString();
    runtime.APP_ORIGIN = `http://127.0.0.1:${resources.nextPort}`;
    runtime.PILOT_MODE = mode;
  }
  assertPilotRuntime(runtime, mode);
  return runtime;
}
