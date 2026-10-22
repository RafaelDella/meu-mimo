import path from 'node:path';
import { assertLocalDatabase, readState, taskResources } from './local-runtime.mjs';

export function mediaEnvironment(target = 'integration') {
  if (!['integration', 'development'].includes(target)) throw new Error('Use integration ou development.');
  const resources = taskResources('t06');
  const state = readState('t06');
  if (!state.media || state.media.bucket !== 'meumimo-t06-private') throw new Error('Execute local:prepare:t06 para preparar mídia.');
  const runtime = { ...state.runtime };
  if (target === 'development') {
    const database = new URL(runtime.DATABASE_URL);
    database.pathname = `/${resources.development}`;
    runtime.DATABASE_URL = database.toString();
    runtime.APP_ORIGIN = 'http://127.0.0.1:4301';
  }
  assertLocalDatabase(runtime.DATABASE_URL, target === 'integration' ? resources.database : resources.development);
  return { ...runtime, SUPABASE_SERVICE_ROLE_KEY: state.integration.SUPABASE_SERVICE_ROLE_KEY,
    MEDIA_BUCKET: state.media.bucket, MEDIA_PREFIX: target,
    MEDIA_TEMP_DIR: path.join(resources.directory, 'temp', target),
    FFMPEG_PATH: state.media.ffmpeg, FFPROBE_PATH: state.media.ffprobe };
}
