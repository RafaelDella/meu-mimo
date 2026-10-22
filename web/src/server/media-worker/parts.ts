import '../only.ts';
import { createHash, createHmac } from 'node:crypto';
import type { MediaAssetView } from '../../contracts/media.ts';
import { AppError } from '../errors.ts';
import { getServerEnv } from '../env.ts';
import { assertMediaUpload, withMediaAsset } from '../media/access.ts';
import type { BrokerEnvelope } from '../media/tokens.ts';
import { mediaAssetView } from '../media/views.ts';
import { databaseNow } from '../stores/transaction.ts';
import { maximumPartBytes } from './config.ts';
import { partKey, putObject } from './storage.ts';

function conflict(): never {
  throw new AppError('operation_conflict', 409, 'Este envio já possui dados diferentes. Consulte o progresso antes de tentar novamente.');
}

export async function acceptMediaPart(envelope: BrokerEnvelope, bytes: Uint8Array): Promise<MediaAssetView> {
  const offset = envelope.offset!;
  if (!Number.isSafeInteger(offset) || offset < 0 || !bytes.length || bytes.length > maximumPartBytes) {
    throw new AppError('body_too_large', 413, 'Envie uma parte válida de até 5 MiB.');
  }
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const target = { assetId: envelope.assetId, offset };
  const check = async (consume: boolean) => withMediaAsset(envelope.identity, envelope.storeId, envelope.assetId, async scope => {
    assertMediaUpload(scope, scope.asset);
    if (consume) {
      const key = createHmac('sha256', getServerEnv().rateLimitSecret)
        .update(`meumimo:t06:parts:${scope.identity.userId}:${scope.asset.id}`).digest('hex');
      await scope.tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
      const now = await databaseNow(scope.tx);
      const bucket = await scope.tx.authRateBucket.findUnique({ where: { key } });
      const attempts = (bucket?.attempts ?? []).filter(value => value.getTime() > now.getTime() - 60_000);
      if (attempts.length >= 120) throw new AppError('rate_limited', 429, 'Aguarde antes de continuar o envio.', 1);
      attempts.push(now);
      await scope.tx.authRateBucket.upsert({ where: { key }, create: { key, attempts }, update: { attempts } });
    }
    const existing = await scope.tx.mediaPart.findUnique({ where: { assetId_offset: target } });
    if (existing) {
      if (existing.sha256 !== sha256 || existing.byteLength !== bytes.length) conflict();
      const asset = scope.asset.state === 'UPLOADING' ? await scope.tx.mediaAsset.update({ where: { id: scope.asset.id },
        data: { lastActivityAt: await databaseNow(scope.tx) } }) : scope.asset;
      return { existing: true, asset };
    }
    if (scope.asset.state !== 'UPLOADING' || scope.asset.uploadedBytes !== offset || offset + bytes.length > scope.asset.byteLength) conflict();
    // A retomada autorizada protege a tentativa antes do trabalho externo.
    const asset = await scope.tx.mediaAsset.update({ where: { id: scope.asset.id },
      data: { lastActivityAt: await databaseNow(scope.tx) } });
    return { existing: false, asset };
  });
  const before = await check(true);
  if (before.existing) return mediaAssetView(before.asset);
  await putObject(partKey(envelope.assetId, offset, sha256), bytes, 'application/octet-stream');
  return withMediaAsset(envelope.identity, envelope.storeId, envelope.assetId, async scope => {
    // Storage não participa da transação: revalidar acesso e offset ao confirmar.
    assertMediaUpload(scope, scope.asset);
    const existing = await scope.tx.mediaPart.findUnique({ where: { assetId_offset: target } });
    if (existing) {
      if (existing.sha256 !== sha256 || existing.byteLength !== bytes.length) conflict();
      return mediaAssetView(scope.asset);
    }
    if (scope.asset.state !== 'UPLOADING' || scope.asset.uploadedBytes !== offset || offset + bytes.length > scope.asset.byteLength) conflict();
    await scope.tx.mediaPart.create({ data: { ...target, byteLength: bytes.length, sha256 } });
    const asset = await scope.tx.mediaAsset.update({ where: { id: scope.asset.id }, data: {
      uploadedBytes: offset + bytes.length, lastActivityAt: await databaseNow(scope.tx),
    } });
    return mediaAssetView(asset);
  });
}
