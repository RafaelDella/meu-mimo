BEGIN;
SET LOCAL search_path = app, public;

-- CreateEnum
CREATE TYPE "MediaPurpose" AS ENUM ('EVIDENCE', 'MEMORY');

-- CreateEnum
CREATE TYPE "MediaType" AS ENUM ('PHOTO', 'VIDEO');

-- CreateEnum
CREATE TYPE "MediaState" AS ENUM ('UPLOADING', 'QUEUED', 'PROCESSING', 'READY', 'FAILED', 'REMOVING', 'REMOVED');

-- CreateTable
CREATE TABLE "MediaCollection" (
    "id" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "participantMembershipId" UUID NOT NULL,
    "purpose" "MediaPurpose" NOT NULL,
    "subjectId" UUID NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "uploadsClosedAt" TIMESTAMPTZ(6),
    "retentionHold" BOOLEAN NOT NULL DEFAULT true,
    "retentionUntil" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaCollection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" UUID NOT NULL,
    "collectionId" UUID NOT NULL,
    "authorProfileId" UUID NOT NULL,
    "revision" INTEGER NOT NULL,
    "mediaType" "MediaType" NOT NULL,
    "mimeType" TEXT NOT NULL,
    "byteLength" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "state" "MediaState" NOT NULL DEFAULT 'UPLOADING',
    "uploadedBytes" INTEGER NOT NULL DEFAULT 0,
    "failureCode" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActivityAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseToken" UUID,
    "leaseUntil" TIMESTAMPTZ(6),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "outputVersion" UUID,
    "processedAt" TIMESTAMPTZ(6),
    "publishedAt" TIMESTAMPTZ(6),
    "removedAt" TIMESTAMPTZ(6),
    "purgedAt" TIMESTAMPTZ(6),
    "width" INTEGER,
    "height" INTEGER,
    "durationMs" INTEGER,
    "displayBytes" INTEGER,
    "thumbnailBytes" INTEGER,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaPart" (
    "assetId" UUID NOT NULL,
    "offset" INTEGER NOT NULL,
    "byteLength" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaPart_pkey" PRIMARY KEY ("assetId","offset")
);

-- CreateIndex
CREATE INDEX "MediaCollection_storeId_participantMembershipId_idx" ON "MediaCollection"("storeId", "participantMembershipId");

-- CreateIndex
CREATE UNIQUE INDEX "MediaCollection_purpose_subjectId_key" ON "MediaCollection"("purpose", "subjectId");

-- CreateIndex
CREATE UNIQUE INDEX "MediaCollection_id_storeId_key" ON "MediaCollection"("id", "storeId");

-- CreateIndex
CREATE INDEX "MediaAsset_collectionId_revision_createdAt_id_idx" ON "MediaAsset"("collectionId", "revision", "createdAt", "id");

-- CreateIndex
CREATE INDEX "MediaAsset_state_availableAt_leaseUntil_idx" ON "MediaAsset"("state", "availableAt", "leaseUntil");

-- AddForeignKey
ALTER TABLE "MediaCollection" ADD CONSTRAINT "MediaCollection_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaCollection" ADD CONSTRAINT "MediaCollection_participantMembershipId_fkey" FOREIGN KEY ("participantMembershipId") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "MediaCollection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_authorProfileId_fkey" FOREIGN KEY ("authorProfileId") REFERENCES "Profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaPart" ADD CONSTRAINT "MediaPart_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "MediaAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Preservar as FKs compostas e CHECKs manuais das migrações anteriores.
ALTER TABLE "MediaCollection" ADD CONSTRAINT "MediaCollection_membership_store_fkey"
  FOREIGN KEY ("participantMembershipId", "storeId") REFERENCES "Membership" (id, "storeId") ON DELETE RESTRICT;
ALTER TABLE "MediaCollection" ADD CONSTRAINT "MediaCollection_revision_check" CHECK (revision >= 1);
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_input_check" CHECK (
  revision >= 1 AND "byteLength" > 0 AND "sha256" ~ '^[a-f0-9]{64}$'
  AND "uploadedBytes" BETWEEN 0 AND "byteLength" AND attempts >= 0
  AND (("mediaType" = 'PHOTO' AND "byteLength" <= 10000000 AND "mimeType" IN ('image/jpeg','image/png','image/webp'))
    OR ("mediaType" = 'VIDEO' AND "byteLength" <= 100000000 AND "mimeType" IN ('video/mp4','video/quicktime')))
  AND ("failureCode" IS NULL OR "failureCode" IN ('file_invalid','processing_failed','processing_timeout'))
);
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_output_check" CHECK (
  (width IS NULL OR width BETWEEN 1 AND 2048) AND (height IS NULL OR height BETWEEN 1 AND 2048)
  AND ("durationMs" IS NULL OR "durationMs" BETWEEN 1 AND 60000)
  AND ("displayBytes" IS NULL OR "displayBytes" BETWEEN 1 AND 40000000)
  AND ("thumbnailBytes" IS NULL OR "thumbnailBytes" BETWEEN 1 AND 2000000)
  AND (state <> 'READY' OR ("outputVersion" IS NOT NULL AND "processedAt" IS NOT NULL
    AND width IS NOT NULL AND height IS NOT NULL AND "displayBytes" IS NOT NULL AND "thumbnailBytes" IS NOT NULL))
  AND ("removedAt" IS NULL OR state IN ('REMOVING','REMOVED'))
);
ALTER TABLE "MediaPart" ADD CONSTRAINT "MediaPart_bytes_check" CHECK (
  "offset" >= 0 AND "byteLength" BETWEEN 1 AND 5242880 AND "sha256" ~ '^[a-f0-9]{64}$'
);

REVOKE ALL ON "MediaCollection", "MediaAsset", "MediaPart" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON "MediaCollection", "MediaAsset", "MediaPart" TO meumimo_runtime;
GRANT UPDATE (revision, "uploadsClosedAt", "retentionHold", "retentionUntil") ON "MediaCollection" TO meumimo_runtime;
GRANT UPDATE (state, "uploadedBytes", "failureCode", "lastActivityAt", "leaseToken", "leaseUntil", attempts,
  "availableAt", "outputVersion", "processedAt", "publishedAt", "removedAt", "purgedAt", width, height,
  "durationMs", "displayBytes", "thumbnailBytes") ON "MediaAsset" TO meumimo_runtime;
GRANT DELETE ON "MediaPart" TO meumimo_runtime;
ALTER TABLE "MediaCollection" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MediaAsset" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MediaPart" ENABLE ROW LEVEL SECURITY;
CREATE POLICY runtime_media_collection ON "MediaCollection" TO meumimo_runtime USING (true) WITH CHECK (true);
CREATE POLICY runtime_media_asset ON "MediaAsset" TO meumimo_runtime USING (true) WITH CHECK (true);
CREATE POLICY runtime_media_part ON "MediaPart" TO meumimo_runtime USING (true) WITH CHECK (true);
COMMIT;
