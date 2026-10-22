-- Prisma cria o schema da conexão; mantemos o SQL explícito para inspeção.
CREATE SCHEMA IF NOT EXISTS "app";
SET search_path TO "app";

-- CreateEnum
CREATE TYPE "MembershipRole" AS ENUM ('MERCHANT', 'PARTICIPANT');

-- CreateTable
CREATE TABLE "Profile" (
    "id" UUID NOT NULL,
    "displayName" TEXT,
    "suspendedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Store" (
    "id" UUID NOT NULL,
    "createdByProfileId" UUID NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Store_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "profileId" UUID NOT NULL,
    "role" "MembershipRole" NOT NULL,
    "accessRevokedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminGrant" (
    "profileId" UUID NOT NULL,
    "grantedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMPTZ(6),

    CONSTRAINT "AdminGrant_pkey" PRIMARY KEY ("profileId")
);

-- CreateTable
CREATE TABLE "AuthSession" (
    "id" UUID NOT NULL,
    "profileId" UUID NOT NULL,
    "recovery" BOOLEAN NOT NULL DEFAULT false,
    "revokedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthRateBucket" (
    "key" TEXT NOT NULL,
    "attempts" TIMESTAMPTZ(6)[] DEFAULT ARRAY[]::TIMESTAMPTZ(6)[],

    CONSTRAINT "AuthRateBucket_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "SecurityAudit" (
    "id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "actorProfileId" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SecurityAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Store_createdByProfileId_idx" ON "Store"("createdByProfileId");

-- CreateIndex
CREATE INDEX "Membership_profileId_accessRevokedAt_idx" ON "Membership"("profileId", "accessRevokedAt");

-- CreateIndex
CREATE INDEX "Membership_storeId_accessRevokedAt_idx" ON "Membership"("storeId", "accessRevokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_storeId_profileId_role_key" ON "Membership"("storeId", "profileId", "role");

-- CreateIndex
CREATE INDEX "AuthSession_profileId_revokedAt_idx" ON "AuthSession"("profileId", "revokedAt");

-- CreateIndex
CREATE INDEX "SecurityAudit_createdAt_idx" ON "SecurityAudit"("createdAt");

-- CreateIndex
CREATE INDEX "SecurityAudit_actorProfileId_createdAt_idx" ON "SecurityAudit"("actorProfileId", "createdAt");

-- AddForeignKey
ALTER TABLE "Store" ADD CONSTRAINT "Store_createdByProfileId_fkey" FOREIGN KEY ("createdByProfileId") REFERENCES "Profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminGrant" ADD CONSTRAINT "AdminGrant_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecurityAudit" ADD CONSTRAINT "SecurityAudit_actorProfileId_fkey" FOREIGN KEY ("actorProfileId") REFERENCES "Profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
