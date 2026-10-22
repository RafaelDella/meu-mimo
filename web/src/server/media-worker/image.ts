import '../only.ts';
import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
import { invalidMedia } from './config.ts';

export type ProcessedMedia = {
  display: Buffer; thumbnail: Buffer; width: number; height: number;
  durationMs: number | null; displayContentType: 'image/jpeg' | 'video/mp4';
};

export async function processImage(input: string, expectedMime: string): Promise<ProcessedMedia> {
  try {
    const options = { limitInputPixels: 40_000_000, failOn: 'error' as const };
    // Entrada limitada em memória evita cache de descritores do libvips,
    // que pode manter o temporário aberto no Windows após processar a imagem.
    const bytes = await readFile(input);
    if (bytes.length > 10_000_000) invalidMedia();
    const metadata = await sharp(bytes, options).metadata();
    const formats: Record<string, string> = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
    if (!metadata.format || formats[metadata.format] !== expectedMime || !metadata.width || !metadata.height ||
        metadata.width * metadata.height > 40_000_000 || (metadata.pages ?? 1) !== 1 || metadata.delay?.length) invalidMedia();
    // Sem keepMetadata/withMetadata: derivados não carregam EXIF, GPS ou XMP.
    const result = await sharp(bytes, options).rotate().flatten({ background: '#ffffff' })
      .resize(2048, 2048, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 })
      .timeout({ seconds: 30 }).toBuffer({ resolveWithObject: true });
    const thumbnail = await sharp(result.data, options).resize(480, 480, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80 }).timeout({ seconds: 15 }).toBuffer();
    if (result.data.length > 20_000_000 || thumbnail.length > 2_000_000) invalidMedia();
    return { display: result.data, thumbnail, width: result.info.width, height: result.info.height,
      durationMs: null, displayContentType: 'image/jpeg' };
  } catch { return invalidMedia(); }
}
