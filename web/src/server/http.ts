import './only.ts';
import { AppError } from './errors.ts';
import { getServerEnv } from './env.ts';

export async function handleRoute(operation: () => Promise<Response>): Promise<Response> {
  let response: Response;
  try {
    response = await operation();
  } catch (error) {
    const known = error instanceof AppError;
    response = Response.json({
      code: known ? error.code : 'service_unavailable',
      message: known ? error.message : 'Não foi possível concluir agora. Tente novamente em instantes.',
    }, { status: known ? error.status : 503 });
    if (known && error.retryAfter) response.headers.set('Retry-After', String(error.retryAfter));
  }
  response.headers.set('Cache-Control', 'private, no-store, max-age=0');
  response.headers.set('Pragma', 'no-cache');
  response.headers.set('Expires', '0');
  response.headers.set('Vary', [response.headers.get('Vary'), 'Cookie'].filter(Boolean).join(', '));
  return response;
}

export function assertMutationOrigin(request: Request): void {
  if (request.headers.get('origin') !== getServerEnv().appOrigin) {
    throw new AppError('origin_forbidden', 403, 'Abra este formulário pelo Meu Mimo e tente novamente.');
  }
}

export async function readJsonObject(request: Request, maximumBytes = 8192): Promise<Record<string, unknown>> {
  assertMutationOrigin(request);
  if (!/^application\/json(?:;|$)/i.test(request.headers.get('content-type') ?? '')) {
    throw new AppError('content_type_invalid', 415, 'Envie os dados no formato esperado pelo formulário.');
  }
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  if (reader) {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      length += part.value.length;
      if (length > maximumBytes) {
        await reader.cancel();
        throw new AppError('body_too_large', 413, 'Os dados enviados são grandes demais.');
      }
      chunks.push(part.value);
    }
  }
  try {
    const data: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Objeto esperado.');
    return data as Record<string, unknown>;
  } catch {
    throw new AppError('body_invalid', 400, 'Confira os dados enviados e tente novamente.');
  }
}

export function stringField(body: Record<string, unknown>, key: string, min = 1, max = 256): string {
  const value = body[key];
  if (typeof value !== 'string' || value.length < min || value.length > max) {
    throw new AppError('field_invalid', 400, 'Confira os campos do formulário.');
  }
  return value;
}

export function optionalStringField(body: Record<string, unknown>, key: string, max = 2048): string | null {
  if (body[key] === undefined || body[key] === null) return null;
  return stringField(body, key, 0, max);
}

export function validatedEmail(body: Record<string, unknown>): string {
  const email = stringField(body, 'email', 3, 254).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new AppError('field_invalid', 400, 'Confira os campos do formulário.');
  }
  return email;
}
