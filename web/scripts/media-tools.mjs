import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { webRoot } from './local-runtime.mjs';

export const mediaToolsDirectory = path.resolve(webRoot, '../.artifacts/t06-tools');
const release = 'ffmpeg-9.0.2-essentials_build';
const checksum = '60f467265b1e312373dbcd92200c2618a74850f98d3d078e94296bb3fa2047ba';
const source = `https://www.gyan.dev/ffmpeg/builds/packages/${release}.zip`;
const mirror = `https://github.com/GyanD/codexffmpeg/releases/download/9.0.2/${release}.zip`;
const archiveBytes = 114_768_076;

async function downloadArchive(archive) {
  const partial = `${archive}.part`;
  let size = existsSync(partial) ? statSync(partial).size : 0;
  if (size > archiveBytes) throw new Error('Pacote parcial maior que o release fixado.');
  const deadline = Date.now() + 15 * 60_000;
  while (size < archiveBytes) {
    const end = Math.min(archiveBytes - 1, size + 4 * 1024 * 1024 - 1);
    let bytes;
    for (let attempt = 0; ; attempt += 1) {
      try {
        const response = await fetch(attempt ? source : mirror, { headers: { Range: `bytes=${size}-${end}` }, signal: AbortSignal.timeout(60_000) });
        if (response.status !== 206 || response.headers.get('content-range') !== `bytes ${size}-${end}/${archiveBytes}`) {
          await response.body?.cancel(); throw new Error('Resposta de intervalo inesperada.');
        }
        bytes = Buffer.from(await response.arrayBuffer());
        if (bytes.length !== end - size + 1) throw new Error('Parte incompleta do pacote.');
        break;
      } catch {
        if (attempt >= 2 || Date.now() > deadline) throw new Error('Não foi possível baixar o pacote de vídeo; o próximo comando retoma o arquivo parcial.');
      }
    }
    appendFileSync(partial, bytes);
    size += bytes.length;
  }
  if (createHash('sha256').update(readFileSync(partial)).digest('hex') !== checksum) throw new Error('SHA-256 do pacote não confere; arquivo não instalado.');
  renameSync(partial, archive);
}

export async function prepareMediaTools() {
  mkdirSync(mediaToolsDirectory, { recursive: true });
  let ffmpeg;
  let ffprobe;
  if (process.platform === 'win32') {
    const archive = path.join(mediaToolsDirectory, `${release}.zip`);
    if (!existsSync(archive)) {
      process.stdout.write('Baixando FFmpeg 9.0.2 local, com hash fixado.\n');
      await downloadArchive(archive);
    }
    if (createHash('sha256').update(readFileSync(archive)).digest('hex') !== checksum) throw new Error('Arquivo local de vídeo adulterado.');
    ffmpeg = path.join(mediaToolsDirectory, release, 'bin/ffmpeg.exe');
    ffprobe = path.join(mediaToolsDirectory, release, 'bin/ffprobe.exe');
    if (!existsSync(ffmpeg) || !existsSync(ffprobe)) {
      const members = execFileSync('tar', ['-tf', archive], { encoding: 'utf8', windowsHide: true });
      if (members.trim().split(/\r?\n/).some(name => !name.startsWith(`${release}/`) || name.split('/').includes('..'))) {
        throw new Error('Caminhos inesperados no pacote de vídeo.');
      }
      execFileSync('tar', ['-xf', archive, '-C', mediaToolsDirectory], { windowsHide: true });
    }
  } else {
    // CI usa o pacote FFmpeg da distribuição, instalado explicitamente no job.
    ffmpeg = '/usr/bin/ffmpeg'; ffprobe = '/usr/bin/ffprobe';
  }
  const options = { encoding: 'utf8', windowsHide: true, timeout: 10_000, maxBuffer: 1024 * 1024 };
  const version = execFileSync(ffmpeg, ['-version'], options).split(/\r?\n/)[0];
  const probeVersion = execFileSync(ffprobe, ['-version'], options).split(/\r?\n/)[0];
  if ((process.platform === 'win32' && !version.startsWith('ffmpeg version 9.0.2')) ||
      !/^ffmpeg version (?:[6-9]|[1-9]\d)\./.test(version)) throw new Error('Versão de vídeo não suportada; use FFmpeg 6 ou superior.');
  const result = { ffmpeg, ffprobe, version, probeVersion, ...(process.platform === 'win32' ? { source, mirror, checksum } : {}) };
  writeFileSync(path.join(mediaToolsDirectory, 'manifest.json'), JSON.stringify(result, null, 2));
  process.stdout.write(`${version}\n${probeVersion}\n`);
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await prepareMediaTools();
}
