import path from 'node:path';
import { assertLocalDatabase, readState, taskResources } from './local-runtime.mjs';
import { pilotResources } from './pilot/resources.mjs';
import { assertPilotRuntime, pilotRuntimeEnvironment } from './pilot/runtime-environment.mjs';

export function mediaEnvironment(target = 'integration', task = 't06') {
  if (!['integration', 'development', 'restore'].includes(target) || (target === 'restore' && task !== 't14')) throw new Error('Use integration, development ou restore exclusivo de t14.');
  if (!['t06', 't07', 't08', 't09', 't10', 't11', 't12', 't13', 't14'].includes(task)) throw new Error('Use t06, t07, t08, t09, t10, t11, t12, t13 ou t14 para mídia.');
  const resources = target === 'restore' ? pilotResources(target) : taskResources(task);
  const state = readState(task, target);
  if (!state.media || state.media.bucket !== 'meumimo-t06-private') throw new Error(`Execute local:prepare:${task} para preparar mídia.`);
  const runtime = task === 't14' ? pilotRuntimeEnvironment(state, target) : { ...state.runtime };
  if (target === 'development' && task !== 't14') {
    const database = new URL(runtime.DATABASE_URL);
    database.pathname = `/${resources.development}`;
    runtime.DATABASE_URL = database.toString();
    runtime.APP_ORIGIN = 'http://127.0.0.1:4301';
  }
  if (task !== 't14') assertLocalDatabase(runtime.DATABASE_URL, target === 'integration' ? resources.database : resources.development);
  const environment = { ...runtime, SUPABASE_SERVICE_ROLE_KEY: state.integration.SUPABASE_SERVICE_ROLE_KEY,
    MEDIA_BUCKET: state.media.bucket, MEDIA_PREFIX: task === 't06' ? target : `${task}-${target}`,
    MEDIA_TEMP_DIR: path.join(resources.directory, 'temp', ...(target === 'restore' ? [] : [target])),
    FFMPEG_PATH: state.media.ffmpeg, FFPROBE_PATH: state.media.ffprobe };
  if (task === 't14') assertPilotRuntime(environment, target);
  return environment;
}
