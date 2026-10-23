import '../only.ts';
import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { AppError } from '../errors.ts';
import { verifyBrokerEnvelope } from '../media/tokens.ts';
import { maximumPartBytes, mediaWorkerConfig } from './config.ts';
import { privateMediaContent } from './content.ts';
import { acceptMediaPart } from './parts.ts';

async function readBody(request: IncomingMessage): Promise<Buffer> {
  const declared = request.headers['content-length'];
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > maximumPartBytes)) {
    throw new AppError('body_too_large', 413, 'A parte enviada excede 5 MiB.');
  }
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += bytes.length;
    if (length > maximumPartBytes) throw new AppError('body_too_large', 413, 'A parte enviada excede 5 MiB.');
    chunks.push(bytes);
  }
  return Buffer.concat(chunks);
}

async function sendContent(response: ServerResponse, content: Response): Promise<void> {
  response.writeHead(content.status, Object.fromEntries(content.headers));
  const reader = content.body!.getReader();
  try {
    for (;;) {
      const item = await reader.read();
      if (item.done) break;
      if (response.destroyed) break;
      if (!response.write(item.value)) await new Promise<void>((resolve, reject) => {
        const cleanup = () => { response.off('drain', ready); response.off('close', ready); response.off('error', failed); };
        const ready = () => { cleanup(); resolve(); };
        const failed = () => { cleanup(); reject(new Error('Media unavailable')); };
        response.once('drain', ready); response.once('close', ready); response.once('error', failed);
      });
    }
    response.end();
  } finally { await reader.cancel(); }
}

async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
  response.setHeader('Cache-Control', 'private, no-store, max-age=0');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  try {
    if (request.method !== 'POST' || !['/part', '/content'].includes(request.url ?? '') ||
        request.headers['content-type'] !== 'application/octet-stream' ||
        typeof request.headers['x-media-envelope'] !== 'string' || typeof request.headers['x-media-signature'] !== 'string') {
      throw new AppError('resource_unavailable', 404, 'Recurso indisponível.');
    }
    const bytes = await readBody(request);
    const envelope = verifyBrokerEnvelope(request.headers['x-media-envelope'], request.headers['x-media-signature'], bytes);
    if (`/${envelope.action}` !== request.url || (envelope.action === 'content' && bytes.length)) {
      throw new AppError('resource_unavailable', 404, 'Recurso indisponível.');
    }
    if (envelope.action === 'content') await sendContent(response, await privateMediaContent(envelope));
    else {
      const asset = await acceptMediaPart(envelope, bytes);
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(asset));
    }
  } catch (error) {
    if (response.headersSent) { response.destroy(); return; }
    const known = error instanceof AppError;
    if (known && error.retryAfter) response.setHeader('Retry-After', String(error.retryAfter));
    response.writeHead(known ? error.status : 503, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ code: known ? error.code : 'service_unavailable',
      message: known ? error.message : 'Não foi possível concluir a operação de mídia agora.' }));
  }
}

export async function startMediaServer({ signal }: { signal?: AbortSignal } = {}): Promise<{ port: number; close: () => Promise<void> }> {
  const config = mediaWorkerConfig();
  const pending = new Set<Promise<void>>();
  let closing = false; let closed: Promise<void> | undefined;
  const server = createServer((request, response) => {
    if (closing || signal?.aborted) {
      response.writeHead(503, { 'Cache-Control': 'private, no-store, max-age=0', 'X-Content-Type-Options': 'nosniff',
        'Content-Type': 'application/json', Connection: 'close' });
      response.end(JSON.stringify({ code: 'service_unavailable', message: 'O processo de mídia está encerrando.' }));
      return;
    }
    const unit = handle(request, response).catch(() => { response.destroy(); });
    pending.add(unit); void unit.then(() => { pending.delete(unit); }, () => { pending.delete(unit); });
  });
  server.requestTimeout = 30_000;
  server.headersTimeout = 10_000;
  server.maxHeadersCount = 30;
  server.keepAliveTimeout = 1_000;
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(config.port, '127.0.0.1', () => { server.off('error', reject); resolve(); });
  });
  return { port: config.port, close: () => {
    closed ??= (async () => {
      closing = true;
      await new Promise<void>((resolve, reject) => {
        server.close(error => { if (error) reject(error); else resolve(); });
        server.closeIdleConnections();
      });
      await Promise.all(pending);
    })();
    return closed;
  } };
}
