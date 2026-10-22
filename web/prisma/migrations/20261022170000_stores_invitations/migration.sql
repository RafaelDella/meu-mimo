BEGIN;
SET search_path TO app;

-- CreateEnum
CREATE TYPE "StoreState" AS ENUM ('ACTIVE', 'PAUSED', 'CLOSED');

-- DropIndex
DROP INDEX "Membership_storeId_profileId_role_key";

-- AlterTable
ALTER TABLE "Membership" ADD COLUMN     "closedAt" TIMESTAMPTZ(6);

-- AlterTable
ALTER TABLE "Store" ADD COLUMN     "closedAt" TIMESTAMPTZ(6),
ADD COLUMN     "creationDigest" TEXT,
ADD COLUMN     "domainStartedAt" TIMESTAMPTZ(6),
ADD COLUMN     "operationId" UUID,
ADD COLUMN     "pausedAt" TIMESTAMPTZ(6),
ADD COLUMN     "presentation" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "state" "StoreState" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo';

-- CreateTable
CREATE TABLE "Invitation" (
    "id" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "createdByProfileId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "revokedAt" TIMESTAMPTZ(6),
    "acceptedAt" TIMESTAMPTZ(6),
    "acceptedByProfileId" UUID,
    "acceptedMembershipId" UUID,

    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreAudit" (
    "id" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "actorProfileId" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "targetId" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoreAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_tokenHash_key" ON "Invitation"("tokenHash");

-- CreateIndex
CREATE INDEX "Invitation_storeId_createdAt_id_idx" ON "Invitation"("storeId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "StoreAudit_storeId_createdAt_id_idx" ON "StoreAudit"("storeId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_storeId_profileId_key" ON "Membership"("storeId", "profileId");

-- CreateIndex
CREATE UNIQUE INDEX "Store_operationId_key" ON "Store"("operationId");

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_createdByProfileId_fkey" FOREIGN KEY ("createdByProfileId") REFERENCES "Profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_acceptedByProfileId_fkey" FOREIGN KEY ("acceptedByProfileId") REFERENCES "Profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_acceptedMembershipId_fkey" FOREIGN KEY ("acceptedMembershipId") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreAudit" ADD CONSTRAINT "StoreAudit_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreAudit" ADD CONSTRAINT "StoreAudit_actorProfileId_fkey" FOREIGN KEY ("actorProfileId") REFERENCES "Profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "Membership_one_merchant_per_store" ON "Membership" ("storeId") WHERE role = 'MERCHANT';
ALTER TABLE "Store" ADD CONSTRAINT "Store_text_limits" CHECK
  (char_length(name) <= 80 AND char_length(presentation) <= 280 AND char_length(timezone) BETWEEN 1 AND 80);
ALTER TABLE "Profile" ADD CONSTRAINT "Profile_displayName_limit" CHECK (char_length("displayName") <= 80);
ALTER TABLE "Store" ADD CONSTRAINT "Store_closed_state" CHECK ((state = 'CLOSED') = ("closedAt" IS NOT NULL));
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_token_hash" CHECK ("tokenHash" ~ '^[a-f0-9]{64}$');
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_acceptance" CHECK
  (("acceptedAt" IS NULL AND "acceptedByProfileId" IS NULL AND "acceptedMembershipId" IS NULL) OR
   ("acceptedAt" IS NOT NULL AND "acceptedByProfileId" IS NOT NULL AND "acceptedMembershipId" IS NOT NULL));
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_not_revoked_after_acceptance" CHECK
  ("acceptedAt" IS NULL OR "revokedAt" IS NULL);

REVOKE ALL ON app."Invitation", app."StoreAudit" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON app."Invitation", app."StoreAudit" TO meumimo_runtime;
GRANT UPDATE ("revokedAt", "acceptedAt", "acceptedByProfileId", "acceptedMembershipId")
  ON app."Invitation" TO meumimo_runtime;
GRANT INSERT ON app."Store", app."Membership" TO meumimo_runtime;
GRANT UPDATE (name, presentation, timezone, state, "pausedAt", "closedAt", "domainStartedAt")
  ON app."Store" TO meumimo_runtime;
GRANT UPDATE ("closedAt") ON app."Membership" TO meumimo_runtime;
GRANT UPDATE ("displayName") ON app."Profile" TO meumimo_runtime;
ALTER TABLE app."Invitation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE app."StoreAudit" ENABLE ROW LEVEL SECURITY;
CREATE POLICY runtime_access ON app."Invitation" TO meumimo_runtime USING (true) WITH CHECK (true);
CREATE POLICY runtime_access ON app."StoreAudit" TO meumimo_runtime USING (true) WITH CHECK (true);
COMMIT;

