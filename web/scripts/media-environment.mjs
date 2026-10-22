import path from 'node:path';
import { assertLocalDatabase, readState, taskResources } from './local-runtime.mjs';

export function mediaEnvironment(target = 'integration', task = 't06') {
  if (!['integration', 'development'].includes(target)) throw new Error('Use integration ou development.');
  if (!['t06', 't07', 't08', 't09'].includes(task)) throw new Error('Use t06, t07, t08 ou t09 para mídia.');
  const resources = taskResources(task);
  const state = readState(task);
  if (!state.media || state.media.bucket !== 'meumimo-t06-private') throw new Error(`Execute local:prepare:${task} para preparar mídia.`);
  const runtime = { ...state.runtime };
  if (target === 'development') {
    const database = new URL(runtime.DATABASE_URL);
    database.pathname = `/${resources.development}`;
    runtime.DATABASE_URL = database.toString();
    runtime.APP_ORIGIN = 'http://127.0.0.1:4301';
  }
  assertLocalDatabase(runtime.DATABASE_URL, target === 'integration' ? resources.database : resources.development);
  return { ...runtime, SUPABASE_SERVICE_ROLE_KEY: state.integration.SUPABASE_SERVICE_ROLE_KEY,
    MEDIA_BUCKET: state.media.bucket, MEDIA_PREFIX: task === 't06' ? target : `${task}-${target}`,
    MEDIA_TEMP_DIR: path.join(resources.directory, 'temp', target),
    FFMPEG_PATH: state.media.ffmpeg, FFPROBE_PATH: state.media.ffprobe };
}
