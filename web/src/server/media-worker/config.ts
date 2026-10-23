import '../only.ts';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AppError } from '../errors.ts';

const webRoot = fileURLToPath(new URL('../../../', import.meta.url));

export function mediaWorkerConfig() {
  const bucket = process.env.MEDIA_BUCKET;
  const prefix = process.env.MEDIA_PREFIX;
  const temp = process.env.MEDIA_TEMP_DIR;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const ffmpeg = process.env.FFMPEG_PATH;
  const ffprobe = process.env.FFPROBE_PATH;
  try {
    const task = /^t(?:0[789]|1[012])-/.test(prefix ?? '') ? prefix!.slice(0, 3) : 't06';
    const target = task !== 't06' ? prefix?.slice(4) : prefix;
    const tempRoot = path.resolve(webRoot, `../.artifacts/${task}-runtime/temp`);
    if (bucket !== 'meumimo-t06-private' || !['integration', 'development'].includes(target ?? '') ||
        url !== 'http://127.0.0.1:54321' || !key || !temp || !path.isAbsolute(temp) ||
        path.resolve(temp) !== path.join(tempRoot, target!) ||
        !ffmpeg || !ffprobe || !path.isAbsolute(ffmpeg) || !path.isAbsolute(ffprobe) ||
        !existsSync(ffmpeg) || !existsSync(ffprobe)) throw new Error();
    const claims = JSON.parse(Buffer.from(key.split('.')[1] ?? '', 'base64url').toString('utf8'));
    if (claims.role !== 'service_role') throw new Error();
    return { bucket, prefix: prefix!, temp, url, key, ffmpeg, ffprobe };
  } catch {
    throw new AppError('media_configuration_invalid', 503, 'A configuração local de mídia precisa ser conferida.');
  }
}

export const maximumPartBytes = 5 * 1024 * 1024;

export function invalidMedia(code = 'media_file_invalid'): never {
  throw new AppError(code, 415, 'Este arquivo não pode ser processado. Escolha outro arquivo compatível.');
}
