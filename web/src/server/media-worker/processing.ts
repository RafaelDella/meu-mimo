import '../only.ts';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, open, rm } from 'node:fs/promises';
import path from 'node:path';
import type { MediaAsset, MediaPart } from '../../generated/prisma/client.ts';
import { getDb } from '../db/client.ts';
import { AppError } from '../errors.ts';
import { databaseNow } from '../stores/transaction.ts';
import { invalidMedia, maximumPartBytes, mediaWorkerConfig } from './config.ts';
import { processImage } from './image.ts';
import { deleteObjects, outputKey, partKey, putObject, readObject } from './storage.ts';
import { processVideo } from './video.ts';

type ClaimedMedia = { asset: MediaAsset; parts: MediaPart[]; token: string };

async function claim(signal?: AbortSignal): Promise<ClaimedMedia | null> {
  return getDb().$transaction(async tx => {
    if (signal?.aborted) return null;
    const candidates = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM app."MediaAsset"
      WHERE "removedAt" IS NULL AND "uploadedBytes" = "byteLength" AND
        ((state = 'QUEUED' AND "availableAt" <= clock_timestamp()) OR
         (state = 'PROCESSING' AND "leaseUntil" <= clock_timestamp()))
      ORDER BY "availableAt", "createdAt", id FOR UPDATE SKIP LOCKED LIMIT 1`;
    if (!candidates.length || signal?.aborted) return null;
    const token = randomUUID();
    const now = await databaseNow(tx);
    if (signal?.aborted) return null;
    const asset = await tx.mediaAsset.update({ where: { id: candidates[0].id }, data: {
      state: 'PROCESSING', leaseToken: token, leaseUntil: new Date(now.getTime() + 300_000),
      attempts: { increment: 1 }, failureCode: null,
    } });
    const parts = await tx.mediaPart.findMany({ where: { assetId: asset.id }, orderBy: { offset: 'asc' } });
    return { asset, parts, token };
  }, { maxWait: 5_000, timeout: 10_000 });
}

async function assemble(job: ClaimedMedia, destination: string): Promise<void> {
  const handle = await open(destination, 'wx', 0o600);
  const hash = createHash('sha256');
  let length = 0;
  try {
    for (const part of job.parts) {
      if (part.offset !== length || part.byteLength < 1 || part.byteLength > maximumPartBytes ||
          length + part.byteLength > job.asset.byteLength) invalidMedia();
      const bytes = await readObject(partKey(job.asset.id, part.offset, part.sha256), part.byteLength);
      if (bytes.length !== part.byteLength || createHash('sha256').update(bytes).digest('hex') !== part.sha256) invalidMedia();
      hash.update(bytes);
      await handle.writeFile(bytes);
      length += bytes.length;
    }
  } finally { await handle.close(); }
  if (length !== job.asset.byteLength || hash.digest('hex') !== job.asset.sha256) invalidMedia();
}

async function ownsLease(job: ClaimedMedia): Promise<boolean> {
  return getDb().$transaction(async tx => {
    const now = await databaseNow(tx);
    const asset = await tx.mediaAsset.findFirst({ where: { id: job.asset.id, state: 'PROCESSING',
      removedAt: null, leaseToken: job.token, leaseUntil: { gt: now } }, select: { id: true } });
    return Boolean(asset);
  });
}

async function recordFailure(job: ClaimedMedia, error: unknown): Promise<void> {
  const invalid = error instanceof AppError && error.status === 415;
  const failureCode = invalid ? 'file_invalid' : error instanceof AppError && error.code === 'media_processing_timeout'
    ? 'processing_timeout' : 'processing_failed';
  await getDb().$transaction(async tx => {
    const now = await databaseNow(tx);
    await tx.mediaAsset.updateMany({ where: { id: job.asset.id, state: 'PROCESSING', removedAt: null,
      leaseToken: job.token, leaseUntil: { gt: now } }, data: {
      state: invalid || job.asset.attempts >= 3 ? 'FAILED' : 'QUEUED', failureCode,
      leaseToken: null, leaseUntil: null, availableAt: new Date(now.getTime() + Math.min(60, 2 ** job.asset.attempts) * 1000),
    } });
  });
}

async function processOne(job: ClaimedMedia): Promise<boolean> {
  const config = mediaWorkerConfig();
  await mkdir(config.temp, { recursive: true, mode: 0o700 });
  const directory = await mkdtemp(path.join(config.temp, `${job.asset.id}-${job.token}-`));
  const written: string[] = [];
  let confirmed = false;
  try {
    const input = path.join(directory, 'input');
    await assemble(job, input);
    const output = job.asset.mediaType === 'PHOTO' ? await processImage(input, job.asset.mimeType)
      : await processVideo(input, job.asset.mimeType, directory);
    if (!await ownsLease(job)) return false;
    const display = outputKey(job.asset.id, job.token, 'display', job.asset.mediaType);
    const thumbnail = outputKey(job.asset.id, job.token, 'thumbnail', job.asset.mediaType);
    written.push(display, thumbnail);
    await putObject(display, output.display, output.displayContentType);
    await putObject(thumbnail, output.thumbnail, 'image/jpeg');
    for (const [key, bytes] of [[display, output.display], [thumbnail, output.thumbnail]] as const) {
      const stored = await readObject(key, bytes.length);
      if (stored.length !== bytes.length || !createHash('sha256').update(stored).digest()
        .equals(createHash('sha256').update(bytes).digest())) throw new AppError('media_storage_unavailable', 503, 'Tente processar novamente.');
    }
    confirmed = await getDb().$transaction(async tx => {
      const now = await databaseNow(tx);
      const result = await tx.mediaAsset.updateMany({ where: { id: job.asset.id, state: 'PROCESSING',
        removedAt: null, leaseToken: job.token, leaseUntil: { gt: now } }, data: {
        state: 'READY', outputVersion: job.token, processedAt: now, failureCode: null,
        width: output.width, height: output.height, durationMs: output.durationMs,
        displayBytes: output.display.length, thumbnailBytes: output.thumbnail.length, leaseToken: null, leaseUntil: null,
      } });
      return result.count === 1;
    });
    return confirmed;
  } catch (error) { await recordFailure(job, error); return false; }
  finally {
    // Uma tentativa antiga nunca apaga derivados pertencentes à tentativa nova.
    if (!confirmed && written.length) {
      try { await deleteObjects(written); } catch { /* Limpeza idempotente retoma os objetos privados. */ }
    }
    const resolved = path.resolve(directory);
    if (path.dirname(resolved) !== path.resolve(config.temp)) throw new AppError('media_configuration_invalid', 503, 'Temporário fora do diretório reservado.');
    await rm(resolved, { recursive: true, force: true });
  }
}

export async function processMediaBatch(options: { limit?: number; signal?: AbortSignal } = {}): Promise<{ processed: number; failed: number }> {
  const limit = options.limit ?? 2;
  if (!Number.isInteger(limit) || limit < 1 || limit > 10) throw new AppError('field_invalid', 400, 'O lote deve conter entre 1 e 10 arquivos.');
  const result = { processed: 0, failed: 0 };
  for (let index = 0; index < limit; index += 1) {
    if (options.signal?.aborted) break;
    const job = await claim(options.signal);
    if (!job) break;
    if (await processOne(job)) result.processed += 1; else result.failed += 1;
  }
  return result;
}
