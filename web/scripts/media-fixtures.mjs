import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { readState, taskResources } from './local-runtime.mjs';

const task = process.argv[2] ?? 't06';
if (!['t06', 't07'].includes(task)) throw new Error('Use t06 ou t07 para fixtures de mídia.');
const state = readState(task);
if (!state.media?.ffmpeg || !state.media?.ffprobe) throw new Error('Prepare a mídia T06 antes das fixtures.');
const directory = path.join(taskResources(task).directory, 'fixtures');
mkdirSync(directory, { recursive: true });
const file = name => path.join(directory, name);
const execute = args => execFileSync(state.media.ffmpeg, ['-nostdin', '-hide_banner', '-loglevel', 'error', '-y', ...args],
  { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], timeout: 90_000 });
const pixels = Buffer.alloc(3000 * 2000 * 3);
for (let y = 0; y < 2000; y += 1) for (let x = 0; x < 3000; x += 1) {
  const offset = (y * 3000 + x) * 3;
  pixels[offset] = x < 1500 ? 230 : 30;
  pixels[offset + 1] = y < 1000 ? 90 : 200;
  pixels[offset + 2] = x < 1500 ? 40 : 220;
}
await sharp(pixels, { raw: { width: 3000, height: 2000, channels: 3 } }).jpeg().withExif({
  IFD0: { Orientation: '6', Artist: 'Fixture sintética T06' },
  IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '1/1 2/1 3/1', GPSLongitudeRef: 'E', GPSLongitude: '4/1 5/1 6/1' },
}).withMetadata({ orientation: 6 }).toFile(file('photo-gps-orientation.jpg'));
await sharp({ create: { width: 640, height: 480, channels: 4, background: '#dff1ea' } }).png().toFile(file('photo.png'));
await sharp({ create: { width: 640, height: 480, channels: 3, background: '#eadff1' } }).webp().toFile(file('photo.webp'));
await sharp({ create: { width: 7000, height: 6000, channels: 3, background: '#ffffff' } }).png().toFile(file('photo-large.png'));
const base = ['-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=12'];
const encoding = ['-t', '1', '-c:v', 'libx264', '-threads', '1', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p'];
execute([...base, '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=44100', ...encoding,
  '-c:a', 'aac', '-shortest', '-metadata', 'location=+01.2345+002.3456/', '-movflags', '+faststart', file('video.mp4')]);
execute(['-i', file('video.mp4'), '-c', 'copy', '-metadata', 'location=+01.2345+002.3456/', file('video.mov')]);
execute([...base, ...encoding, '-an', file('video-silent.mp4')]);
execute(['-display_rotation:v:0', '90', '-i', file('video.mov'), '-c', 'copy', file('video-rotated.mov')]);
execute(['-f', 'lavfi', '-i', 'color=c=blue:size=32x32:rate=1', '-t', '61', '-an',
  '-c:v', 'libx264', '-threads', '1', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', file('video-long.mp4')]);
const names = ['photo-gps-orientation.jpg', 'photo.png', 'photo.webp', 'photo-large.png', 'video.mp4', 'video.mov', 'video-silent.mp4', 'video-rotated.mov', 'video-long.mp4'];
const metadata = await sharp(file('photo-gps-orientation.jpg')).metadata();
if (metadata.orientation !== 6 || !metadata.exif) throw new Error('A fixture de foto não preservou orientação/EXIF de entrada.');
const rotated = JSON.parse(execFileSync(state.media.ffprobe, ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file('video-rotated.mov')],
  { encoding: 'utf8', windowsHide: true, timeout: 15_000 }));
if (!rotated.streams.some(stream => stream.side_data_list?.some(item => Math.abs(item.rotation ?? 0) === 90))) {
  throw new Error('A fixture de vídeo não preservou rotação de entrada.');
}
writeFileSync(file('manifest.json'), JSON.stringify({ synthetic: true, orientation: metadata.orientation,
  files: Object.fromEntries(names.map(name => { const bytes = readFileSync(file(name));
    return [name, { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }]; })) }, null, 2));
process.stdout.write('Nove arquivos sintéticos locais gerados, com orientação/EXIF e rotação de entrada comprovados.\n');
