import { Readable, Transform } from 'node:stream';
import { encryptComponent } from './archive.mjs';
import { rightsAudience } from './rights-export-data.mjs';
import { rightsError } from './rights-db.mjs';

/** Derivados oferecidos pela audiência normal; nunca originais expirados ou mídia suprimida. */
export async function* exportMedia(context, subjectId, input) {
  if (context.bucket !== 'meumimo-t06-private') throw rightsError();
  let cursor = '';
  for (;;) {
    const rows = (await context.database.query(`SELECT a.id,a."mediaType",a."mimeType",a."outputVersion",a."displayBytes",a."thumbnailBytes"
      FROM app."MediaAsset" a JOIN app."MediaCollection" c ON c.id=a."collectionId"
      WHERE a.id::text>$2 AND ${rightsAudience('c."storeId"', 'c."participantMembershipId"')}
      AND a.state='READY' AND a."removedAt" IS NULL AND a."purgedAt" IS NULL AND a."outputVersion" IS NOT NULL
      AND (a."publishedAt" IS NOT NULL OR a."authorProfileId"=$1)
      AND (c.purpose<>'MEMORY' OR EXISTS(SELECT 1 FROM app."TicketAlbum" t JOIN app."Redemption" r ON r.id=t."redemptionId"
        JOIN app."Membership" merchant ON merchant."storeId"=t."storeId" AND merchant."profileId"=t."createdByProfileId" AND merchant.role='MERCHANT'
        WHERE t."collectionId"=c.id AND t."redemptionId"=c."subjectId" AND t."storeId"=c."storeId"
        AND t."participantMembershipId"=c."participantMembershipId" AND r."participantMembershipId"=c."participantMembershipId"
        AND merchant."accessRevokedAt" IS NULL))
      AND (c."retentionUntil" IS NULL OR c."retentionUntil">clock_timestamp())
      AND (c.purpose<>'EVIDENCE' OR a."publishedAt" IS NULL OR a."publishedAt">clock_timestamp()-interval '180 days')
      AND NOT EXISTS(SELECT 1 FROM app."DataSuppression" s WHERE s."subjectProfileId"=a."authorProfileId" AND s.scope IN ('IDENTITY','AUTHORED_CONTENT'))
      ORDER BY a.id::text LIMIT 50`, [subjectId, cursor])).rows;
    if (!rows.length) return;
    for (const row of rows) {
      cursor = row.id;
      for (const variant of ['display', 'thumbnail']) {
        const bytes = variant === 'display' ? row.displayBytes : row.thumbnailBytes;
        if (!Number.isSafeInteger(bytes) || bytes < 1 || bytes > (variant === 'display' ? 40_000_000 : 2_000_000)) throw rightsError();
        const filename = variant === 'thumbnail' ? 'thumbnail.jpg' : row.mediaType === 'VIDEO' ? 'display.mp4' : 'display.jpg';
        const object = `${context.resources.mediaPrefix}/${row.id}/${row.outputVersion}/${filename}`;
        const response = await fetch(`${context.runtime.SUPABASE_URL}/storage/v1/object/authenticated/${context.bucket}/${object}`, {
          headers: { Authorization: `Bearer ${context.serviceRole}`, apikey: context.serviceRole },
          redirect: 'error', signal: AbortSignal.timeout(30_000),
        });
        if (!response.ok || !response.body) { await response.body?.cancel(); throw rightsError(); }
        let length = 0;
        const limited = new Transform({
          transform(chunk, encoding, callback) {
            length += chunk.length;
            callback(length > bytes ? rightsError() : null, chunk);
          },
          flush(callback) { callback(length === bytes ? null : rightsError()); },
        });
        const source = Readable.fromWeb(response.body);
        source.on('error', error => limited.destroy(error));
        limited.on('close', () => source.destroy());
        source.pipe(limited);
        const component = await encryptComponent({ ...input, source: limited, name: `media-${row.id}-${variant}` });
        yield { ...component, kind: 'media', assetId: row.id, variant,
          mimeType: variant === 'thumbnail' || row.mediaType === 'PHOTO' ? 'image/jpeg' : 'video/mp4' };
      }
    }
    if (rows.length < 50) return;
  }
}
