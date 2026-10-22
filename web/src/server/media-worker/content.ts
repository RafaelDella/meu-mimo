import '../only.ts';
import { AppError } from '../errors.ts';
import { assertMediaRead, withMediaAsset } from '../media/access.ts';
import type { BrokerEnvelope } from '../media/tokens.ts';
import { objectResponse, outputKey } from './storage.ts';

function requestedRange(header: string | undefined, length: number): { start: number; end: number } | undefined {
  if (header === undefined) return undefined;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2])) throw new AppError('media_range_invalid', 416, 'Intervalo de arquivo inválido.');
  const start = match[1] ? Number(match[1]) : Math.max(0, length - Number(match[2]));
  const end = match[1] ? (match[2] ? Math.min(length - 1, Number(match[2])) : length - 1) : length - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end || start >= length ||
      (!match[1] && Number(match[2]) <= 0)) throw new AppError('media_range_invalid', 416, 'Intervalo de arquivo inválido.');
  return { start, end };
}

export async function privateMediaContent(envelope: BrokerEnvelope): Promise<Response> {
  const current = () => withMediaAsset(envelope.identity, envelope.storeId, envelope.assetId, async scope => {
    assertMediaRead(scope);
    const asset = scope.asset;
    if (asset.state !== 'READY' || !asset.outputVersion || !asset.displayBytes || !asset.thumbnailBytes) {
      throw new AppError('media_not_ready', 409, 'Este arquivo ainda não está pronto.');
    }
    return asset;
  });
  const asset = await current();
  const variant = envelope.variant!;
  const length = variant === 'thumbnail' ? asset.thumbnailBytes! : asset.displayBytes!;
  const range = requestedRange(envelope.range, length);
  const response = await objectResponse(outputKey(asset.id, asset.outputVersion!, variant, asset.mediaType), range);
  if (range && (response.status !== 206 || response.headers.get('content-range') !== `bytes ${range.start}-${range.end}/${length}`)) {
    await response.body?.cancel();
    throw new AppError('media_storage_unavailable', 503, 'Não foi possível abrir este intervalo agora.');
  }
  try {
    const latest = await current();
    if (latest.outputVersion !== asset.outputVersion) throw new AppError('media_not_ready', 409, 'Abra o arquivo novamente.');
  } catch (error) { await response.body?.cancel(); throw error; }
  const expected = range ? range.end - range.start + 1 : length;
  const headers = new Headers({
    'Content-Type': variant === 'thumbnail' || asset.mediaType === 'PHOTO' ? 'image/jpeg' : 'video/mp4',
    'Content-Length': String(expected), 'Accept-Ranges': 'bytes', 'Content-Disposition': 'inline',
    'Cache-Control': 'private, no-store, max-age=0', 'X-Content-Type-Options': 'nosniff',
  });
  if (range) headers.set('Content-Range', `bytes ${range.start}-${range.end}/${length}`);
  const reader = response.body!.getReader();
  let received = 0;
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const item = await reader.read();
        if (item.done) {
          if (received !== expected) throw new Error('Incomplete media response');
          controller.close();
        } else {
          received += item.value.length;
          if (received > expected) throw new Error('Unexpected media response');
          controller.enqueue(item.value);
        }
      } catch { await reader.cancel(); controller.error(new Error('Media unavailable')); }
    },
    async cancel() { await reader.cancel(); },
  });
  return new Response(body, { status: range ? 206 : 200, headers });
}
