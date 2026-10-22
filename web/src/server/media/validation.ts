import '../only.ts';
import type { MediaFileInput } from '../../contracts/media.ts';
import { AppError } from '../errors.ts';
import { allowedFields, invalidField, operationId } from '../stores/validation.ts';

export function mediaFiles(body: Record<string, unknown>): MediaFileInput[] {
  allowedFields(body, ['files']);
  if (!Array.isArray(body.files) || body.files.length < 1 || body.files.length > 10) invalidField();
  const files = body.files.map((value): MediaFileInput => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) invalidField();
    const file = value as Record<string, unknown>;
    allowedFields(file, ['operationId', 'mediaType', 'mimeType', 'byteLength', 'sha256']);
    const id = operationId(file);
    if (file.mediaType !== 'PHOTO' && file.mediaType !== 'VIDEO') invalidField();
    const formats = file.mediaType === 'PHOTO' ? ['image/jpeg', 'image/png', 'image/webp'] : ['video/mp4', 'video/quicktime'];
    if (typeof file.mimeType !== 'string' || !formats.includes(file.mimeType)) {
      throw new AppError('media_format_invalid', 415, 'Escolha uma foto JPEG, PNG ou WebP, ou um vídeo MP4 ou MOV.');
    }
    if (typeof file.byteLength !== 'number' || !Number.isSafeInteger(file.byteLength) || file.byteLength < 1) invalidField();
    if (file.byteLength > (file.mediaType === 'PHOTO' ? 10_000_000 : 100_000_000)) {
      throw new AppError('media_too_large', 413, 'O arquivo ultrapassa o limite de tamanho permitido.');
    }
    if (typeof file.sha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(file.sha256)) invalidField();
    return { operationId: id, mediaType: file.mediaType, mimeType: file.mimeType,
      byteLength: file.byteLength, sha256: file.sha256.toLowerCase() };
  });
  if (new Set(files.map(file => file.operationId)).size !== files.length) invalidField();
  return files;
}
