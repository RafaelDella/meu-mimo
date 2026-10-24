BEGIN;
SET LOCAL search_path = app, public;

-- Scoped Prisma diff: preserve the manually maintained guards of other domains.
ALTER TABLE "Invitation" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'LEGACY_LINK',
  ADD COLUMN "codeHash" TEXT, ADD COLUMN "codeNonce" INTEGER,
  ADD COLUMN "creationDigest" TEXT, ADD COLUMN "maxUses" INTEGER DEFAULT 1,
  ADD COLUMN "useCount" INTEGER NOT NULL DEFAULT 0,
  ALTER COLUMN "expiresAt" DROP NOT NULL;
ALTER TABLE "OutboxEvent" ADD COLUMN "invitationUseId" UUID;

CREATE UNIQUE INDEX "Invitation_codeHash_key" ON "Invitation"("codeHash");
CREATE UNIQUE INDEX "Invitation_id_storeId_key" ON "Invitation"("id", "storeId");
CREATE UNIQUE INDEX "Membership_id_storeId_profileId_key" ON "Membership"("id", "storeId", "profileId");
CREATE TABLE "InvitationUse" (
  id UUID PRIMARY KEY, "invitationId" UUID NOT NULL, "storeId" UUID NOT NULL,
  "profileId" UUID NOT NULL, "membershipId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InvitationUse_invitationId_storeId_fkey" FOREIGN KEY ("invitationId", "storeId")
    REFERENCES "Invitation"(id, "storeId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "InvitationUse_membershipId_storeId_profileId_fkey" FOREIGN KEY ("membershipId", "storeId", "profileId")
    REFERENCES "Membership"(id, "storeId", "profileId") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "InvitationUse_membershipId_key" ON "InvitationUse"("membershipId");
CREATE INDEX "InvitationUse_invitationId_createdAt_id_idx" ON "InvitationUse"("invitationId", "createdAt", id);
CREATE UNIQUE INDEX "OutboxEvent_invitationUseId_key" ON "OutboxEvent"("invitationUseId");
ALTER TABLE "OutboxEvent" ADD CONSTRAINT "OutboxEvent_invitationUseId_fkey"
  FOREIGN KEY ("invitationUseId") REFERENCES "InvitationUse"(id) ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "InvitationUse" (id, "invitationId", "storeId", "profileId", "membershipId", "createdAt")
  SELECT id, id, "storeId", "acceptedByProfileId", "acceptedMembershipId", "acceptedAt"
  FROM "Invitation" WHERE "acceptedAt" IS NOT NULL;
UPDATE "Invitation" SET "useCount" = 1 WHERE "acceptedAt" IS NOT NULL;

ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_code_policy" CHECK (
  (kind = 'LEGACY_LINK' AND "expiresAt" IS NOT NULL AND "maxUses" IS NOT NULL AND "maxUses" = 1
    AND "codeHash" IS NULL AND "codeNonce" IS NULL AND "creationDigest" IS NULL)
  OR (kind = 'CODE' AND "codeHash" ~ '^[a-f0-9]{64}$' AND "codeHash" IS NOT NULL
    AND "creationDigest" ~ '^[a-f0-9]{64}$' AND "creationDigest" IS NOT NULL
    AND "codeNonce" BETWEEN 0 AND 4 AND "codeNonce" IS NOT NULL
    AND "acceptedAt" IS NULL AND "acceptedByProfileId" IS NULL AND "acceptedMembershipId" IS NULL)
);
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_usage_limits" CHECK (
  "useCount" >= 0 AND ("maxUses" IS NULL OR ("maxUses" BETWEEN 1 AND 1000000 AND "useCount" <= "maxUses"))
);

CREATE FUNCTION app.check_invitation_use_count() RETURNS trigger LANGUAGE plpgsql
  SET search_path = pg_catalog, app AS $$
DECLARE target UUID; invitation app."Invitation"; total BIGINT;
BEGIN
  IF TG_TABLE_NAME = 'Invitation' THEN target := NEW.id;
  ELSIF TG_OP = 'DELETE' THEN target := OLD."invitationId";
  ELSE target := NEW."invitationId"; END IF;
  SELECT * INTO invitation FROM app."Invitation" WHERE id = target;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT count(*) INTO total FROM app."InvitationUse" WHERE "invitationId" = target;
  IF total <> invitation."useCount" OR (invitation.kind = 'LEGACY_LINK' AND
      ((invitation."acceptedAt" IS NULL AND total <> 0) OR (invitation."acceptedAt" IS NOT NULL AND total <> 1))) THEN
    RAISE EXCEPTION 'Invitation usage does not match its history' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (SELECT 1 FROM app."InvitationUse" u JOIN app."Membership" m ON m.id = u."membershipId"
      WHERE u."invitationId" = target AND (m.role <> 'PARTICIPANT' OR
        (invitation.kind = 'LEGACY_LINK' AND (u."profileId" <> invitation."acceptedByProfileId"
          OR u."membershipId" <> invitation."acceptedMembershipId" OR u."createdAt" <> invitation."acceptedAt")))) THEN
    RAISE EXCEPTION 'Invitation usage context is inconsistent' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER "Invitation_usage_history" AFTER INSERT OR UPDATE ON "Invitation"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.check_invitation_use_count();
CREATE CONSTRAINT TRIGGER "InvitationUse_usage_history" AFTER INSERT OR UPDATE OR DELETE ON "InvitationUse"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.check_invitation_use_count();

CREATE FUNCTION app.check_invitation_outbox_use() RETURNS trigger LANGUAGE plpgsql
  SET search_path = pg_catalog, app AS $$
DECLARE mode TEXT;
BEGIN
  IF NEW.kind = 'INVITATION_ACCEPTED' THEN
    SELECT kind INTO mode FROM app."Invitation" WHERE id = NEW."invitationId";
    IF (mode = 'CODE' AND NEW."invitationUseId" IS NULL) OR
      (NEW."invitationUseId" IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM app."InvitationUse" u WHERE u.id = NEW."invitationUseId"
          AND u."invitationId" = NEW."invitationId" AND u."storeId" = NEW."storeId"
          AND u."membershipId" = NEW."participantMembershipId" AND u."profileId" = NEW."actorProfileId")) THEN
      RAISE EXCEPTION 'Invitation notification context is inconsistent' USING ERRCODE = '23514';
    END IF;
  ELSIF NEW."invitationUseId" IS NOT NULL THEN
    RAISE EXCEPTION 'Unexpected invitation usage source' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "Outbox_invitation_use_context" BEFORE INSERT OR UPDATE ON "OutboxEvent"
  FOR EACH ROW EXECUTE FUNCTION app.check_invitation_outbox_use();

REVOKE ALL ON "InvitationUse" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON "InvitationUse" TO meumimo_runtime;
GRANT UPDATE ("useCount") ON "Invitation" TO meumimo_runtime;
ALTER TABLE "InvitationUse" ENABLE ROW LEVEL SECURITY;
CREATE POLICY runtime_access ON "InvitationUse" TO meumimo_runtime USING (true) WITH CHECK (true);
REVOKE ALL ON FUNCTION app.check_invitation_use_count(), app.check_invitation_outbox_use() FROM PUBLIC;
COMMIT;
