import '../only.ts';
import { execFile } from 'node:child_process';
import { open, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { AppError } from '../errors.ts';
import { invalidMedia, mediaWorkerConfig } from './config.ts';
import type { ProcessedMedia } from './image.ts';

const execute = promisify(execFile);
type ProbeStream = {
  codec_type?: string; codec_name?: string; width?: number; height?: number; pix_fmt?: string;
  duration?: string; color_transfer?: string; color_primaries?: string; sample_aspect_ratio?: string;
  tags?: Record<string, string>; side_data_list?: { rotation?: number; side_data_type?: string }[];
};
type Probe = { streams: ProbeStream[]; format: { duration?: string; format_name?: string; tags?: Record<string, string> } };

async function run(executable: string, args: string[], timeout: number): Promise<string> {
  try {
    const result = await execute(executable, args, { timeout, killSignal: 'SIGKILL', maxBuffer: 2_000_000,
      windowsHide: true, encoding: 'utf8' });
    return result.stdout;
  } catch (error) {
    if (error && typeof error === 'object' && 'killed' in error && error.killed) {
      throw new AppError('media_processing_timeout', 503, 'O processamento demorou mais que o esperado. Tente novamente.');
    }
    return invalidMedia();
  }
}

export async function probeVideo(input: string): Promise<Probe> {
  const output = await run(mediaWorkerConfig().ffprobe, ['-v', 'error', '-threads', '2', '-protocol_whitelist', 'file',
    '-format_whitelist', 'mov,mp4,m4a,3gp,3g2,mj2', '-enable_drefs', '0', '-use_absolute_path', '0',
    '-show_streams', '-show_format', '-of', 'json', input], 20_000);
  try {
    const parsed = JSON.parse(output) as Probe;
    if (!Array.isArray(parsed.streams) || !parsed.format) invalidMedia();
    return parsed;
  } catch { return invalidMedia(); }
}

function duration(probe: Probe): number {
  const values = [Number(probe.format.duration), ...probe.streams.map(stream => Number(stream.duration))]
    .filter(value => Number.isFinite(value) && value > 0);
  if (!values.length) invalidMedia();
  return Math.max(...values);
}

function checkInput(probe: Probe, expectedMime: string): { video: ProbeStream; hasAudio: boolean } {
  const videos = probe.streams.filter(stream => stream.codec_type === 'video');
  const audios = probe.streams.filter(stream => stream.codec_type === 'audio');
  if (!probe.format.format_name?.split(',').includes('mov') || videos.length !== 1 || audios.length > 1 ||
      probe.streams.some(stream => !['video', 'audio'].includes(stream.codec_type ?? '')) || duration(probe) > 60) invalidMedia();
  const video = videos[0];
  const width = video.width ?? 0;
  const height = video.height ?? 0;
  const brand = probe.format.tags?.major_brand?.trim();
  if (!['video/mp4', 'video/quicktime'].includes(expectedMime) ||
      (expectedMime === 'video/quicktime' ? brand !== 'qt' : brand === 'qt') ||
      !['h264', 'hevc'].includes(video.codec_name ?? '') || !['yuv420p', 'yuvj420p'].includes(video.pix_fmt ?? '') ||
      width < 2 || height < 2 || Math.max(width, height) > 3840 || Math.min(width, height) > 2160 ||
      !['1:1', 'N/A', undefined].includes(video.sample_aspect_ratio) ||
      ['smpte2084', 'arib-std-b67'].includes(video.color_transfer ?? '') ||
      video.color_primaries === 'bt2020' ||
      video.side_data_list?.some(item => /mastering|content light/i.test(item.side_data_type ?? '')) ||
      audios.some(stream => !['aac', 'alac', 'pcm_s16le', 'pcm_s24le'].includes(stream.codec_name ?? ''))) invalidMedia();
  return { video, hasAudio: audios.length === 1 };
}

function checkOutput(probe: Probe): ProbeStream {
  const video = probe.streams.find(stream => stream.codec_type === 'video');
  if (!video || video.codec_name !== 'h264' || video.pix_fmt !== 'yuv420p' || !video.width || !video.height ||
      Math.max(video.width, video.height) > 1920 || Math.min(video.width, video.height) > 1080 ||
      video.width % 2 !== 0 || video.height % 2 !== 0 || duration(probe) > 60.2 ||
      probe.streams.some(stream => stream.codec_type === 'audio' && stream.codec_name !== 'aac') ||
      Object.keys(probe.format.tags ?? {}).some(key => /location|gps|ISO6709/i.test(key)) ||
      probe.streams.some(stream => Object.keys(stream.tags ?? {}).some(key => /location|gps|ISO6709/i.test(key))) ||
      video.side_data_list?.some(item => item.rotation && item.rotation % 360 !== 0)) invalidMedia();
  return video;
}

export async function processVideo(input: string, expectedMime: string, directory: string): Promise<ProcessedMedia> {
  const descriptor = await open(input, 'r');
  const header = Buffer.alloc(12);
  try { await descriptor.read(header, 0, header.length, 0); } finally { await descriptor.close(); }
  if (!['ftyp', 'moov', 'mdat', 'wide', 'free'].includes(header.toString('ascii', 4, 8))) invalidMedia();
  const source = await probeVideo(input);
  const { hasAudio } = checkInput(source, expectedMime);
  const config = mediaWorkerConfig();
  const destination = path.join(directory, 'display.mp4');
  const thumbnailPath = path.join(directory, 'thumbnail.jpg');
  const scale = "scale=w='min(iw,if(gte(iw,ih),1920,1080))':h='min(ih,if(gte(iw,ih),1080,1920))':force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1";
  const args = ['-nostdin', '-hide_banner', '-loglevel', 'error', '-xerror', '-threads', '2', '-filter_threads', '1',
    '-protocol_whitelist', 'file', '-format_whitelist', 'mov,mp4,m4a,3gp,3g2,mj2', '-enable_drefs', '0', '-use_absolute_path', '0', '-i', input,
    '-map', '0:v:0', ...(hasAudio ? ['-map', '0:a:0'] : ['-an']), '-sn', '-dn', '-map_metadata', '-1', '-map_chapters', '-1',
    '-metadata:s:v:0', 'rotate=0', '-vf', scale, '-c:v', 'libx264', '-threads', '2', '-preset', 'fast',
    '-b:v', '3500k', '-maxrate', '4000k', '-bufsize', '8000k', '-pix_fmt', 'yuv420p',
    ...(hasAudio ? ['-c:a', 'aac', '-b:a', '128k'] : []), '-movflags', '+faststart', '-y', destination];
  await run(config.ffmpeg, args, 180_000);
  if ((await stat(destination)).size > 40_000_000) invalidMedia();
  const delivered = await probeVideo(destination);
  const video = checkOutput(delivered);
  await run(config.ffmpeg, ['-nostdin', '-hide_banner', '-loglevel', 'error', '-threads', '2', '-filter_threads', '1',
    '-protocol_whitelist', 'file', '-i', destination, '-map', '0:v:0', '-frames:v', '1',
    '-vf', 'scale=480:480:force_original_aspect_ratio=decrease', '-map_metadata', '-1', '-q:v', '3', '-y', thumbnailPath], 20_000);
  const thumbnail = await readFile(thumbnailPath);
  if (thumbnail.length > 2_000_000) invalidMedia();
  return { display: await readFile(destination), thumbnail, width: video.width!, height: video.height!,
    durationMs: Math.round(duration(delivered) * 1000), displayContentType: 'video/mp4' };
}
