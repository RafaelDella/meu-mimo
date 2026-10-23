BEGIN;
SET LOCAL search_path=app;

ALTER TYPE "NotificationKind" ADD VALUE 'ALBUM_PUBLISHED';
CREATE TABLE "TicketAlbum" (
 id uuid PRIMARY KEY, "storeId" uuid NOT NULL, "redemptionId" uuid NOT NULL,
 "participantMembershipId" uuid NOT NULL, "collectionId" uuid NOT NULL,
 "createdByProfileId" uuid NOT NULL, version integer NOT NULL DEFAULT 1,
 "nextPosition" integer NOT NULL DEFAULT 1,
 "createdAt" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "TicketAlbum_version_check" CHECK (version>=1 AND "nextPosition">=1)
);
CREATE TABLE "AlbumEvent" (
 id uuid PRIMARY KEY, "albumId" uuid NOT NULL, "storeId" uuid NOT NULL,
 "redemptionId" uuid NOT NULL, "actorProfileId" uuid NOT NULL, version integer NOT NULL,
 kind text NOT NULL, "requestDigest" text NOT NULL, "removedAssetId" uuid,
 "createdAt" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "AlbumEvent_fields_check" CHECK (version>=2 AND "requestDigest" ~ '^[a-f0-9]{64}$'
 AND ((kind='PUBLISH' AND "removedAssetId" IS NULL) OR (kind='REMOVE' AND "removedAssetId" IS NOT NULL)))
);
CREATE TABLE "AlbumItem" (
 "assetId" uuid PRIMARY KEY, "albumId" uuid NOT NULL, "publicationId" uuid NOT NULL,
 "storeId" uuid NOT NULL, position integer NOT NULL, caption text NOT NULL DEFAULT '',
 "createdAt" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "AlbumItem_fields_check" CHECK (position>=1 AND char_length(caption)<=500 AND app.ticket_text_valid(caption))
);
CREATE UNIQUE INDEX "TicketAlbum_redemptionId_key" ON "TicketAlbum"("redemptionId");
CREATE UNIQUE INDEX "TicketAlbum_collectionId_key" ON "TicketAlbum"("collectionId");
CREATE UNIQUE INDEX "TicketAlbum_id_redemptionId_storeId_key" ON "TicketAlbum"(id,"redemptionId","storeId");
CREATE INDEX "TicketAlbum_storeId_participantMembershipId_idx" ON "TicketAlbum"("storeId","participantMembershipId");
CREATE UNIQUE INDEX "AlbumEvent_albumId_version_key" ON "AlbumEvent"("albumId",version);
CREATE UNIQUE INDEX "AlbumEvent_id_albumId_storeId_key" ON "AlbumEvent"(id,"albumId","storeId");
CREATE UNIQUE INDEX "AlbumEvent_removedAssetId_key" ON "AlbumEvent"("removedAssetId");
CREATE INDEX "AlbumEvent_storeId_createdAt_id_idx" ON "AlbumEvent"("storeId","createdAt",id);
CREATE UNIQUE INDEX "AlbumItem_albumId_position_key" ON "AlbumItem"("albumId",position);

ALTER TABLE "TicketAlbum" ADD CONSTRAINT "TicketAlbum_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TicketAlbum" ADD CONSTRAINT "TicketAlbum_redemptionId_fkey" FOREIGN KEY ("redemptionId") REFERENCES "Redemption"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TicketAlbum" ADD CONSTRAINT "TicketAlbum_participantMembershipId_fkey" FOREIGN KEY ("participantMembershipId") REFERENCES "Membership"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TicketAlbum" ADD CONSTRAINT "TicketAlbum_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "MediaCollection"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TicketAlbum" ADD CONSTRAINT "TicketAlbum_createdByProfileId_fkey" FOREIGN KEY ("createdByProfileId") REFERENCES "Profile"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TicketAlbum" ADD CONSTRAINT "Album_ticket_context_fkey" FOREIGN KEY ("redemptionId","storeId","participantMembershipId")
 REFERENCES "Redemption"(id,"storeId","participantMembershipId") ON DELETE RESTRICT;
ALTER TABLE "TicketAlbum" ADD CONSTRAINT "Album_collection_context_fkey" FOREIGN KEY ("collectionId","storeId") REFERENCES "MediaCollection"(id,"storeId") ON DELETE RESTRICT;
ALTER TABLE "AlbumEvent" ADD CONSTRAINT "AlbumEvent_albumId_fkey" FOREIGN KEY ("albumId") REFERENCES "TicketAlbum"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AlbumEvent" ADD CONSTRAINT "AlbumEvent_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AlbumEvent" ADD CONSTRAINT "AlbumEvent_redemptionId_fkey" FOREIGN KEY ("redemptionId") REFERENCES "Redemption"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AlbumEvent" ADD CONSTRAINT "AlbumEvent_actorProfileId_fkey" FOREIGN KEY ("actorProfileId") REFERENCES "Profile"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AlbumEvent" ADD CONSTRAINT "AlbumEvent_removedAssetId_fkey" FOREIGN KEY ("removedAssetId") REFERENCES "MediaAsset"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AlbumEvent" ADD CONSTRAINT "Album_event_context_fkey" FOREIGN KEY ("albumId","redemptionId","storeId") REFERENCES "TicketAlbum"(id,"redemptionId","storeId") ON DELETE RESTRICT;
ALTER TABLE "AlbumItem" ADD CONSTRAINT "AlbumItem_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "MediaAsset"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AlbumItem" ADD CONSTRAINT "AlbumItem_albumId_fkey" FOREIGN KEY ("albumId") REFERENCES "TicketAlbum"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AlbumItem" ADD CONSTRAINT "AlbumItem_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "AlbumEvent"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AlbumItem" ADD CONSTRAINT "Album_item_publication_context_fkey" FOREIGN KEY ("publicationId","albumId","storeId")
 REFERENCES "AlbumEvent"(id,"albumId","storeId") ON DELETE RESTRICT;
ALTER TABLE "OutboxEvent" ADD COLUMN "albumEventId" uuid;
ALTER TABLE "OutboxEvent" ADD CONSTRAINT "OutboxEvent_albumEventId_fkey" FOREIGN KEY ("albumEventId") REFERENCES "AlbumEvent"(id) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "OutboxEvent" DROP CONSTRAINT "OutboxEvent_typed_source";
ALTER TABLE "OutboxEvent" ADD CONSTRAINT "OutboxEvent_typed_source" CHECK (
 ("albumEventId" IS NULL AND (
  ("redemptionEventId" IS NULL AND (("redemptionId" IS NULL AND (
   (kind::text='INVITATION_ACCEPTED' AND "invitationId" IS NOT NULL AND "commentId" IS NULL AND "submissionId" IS NULL AND "reviewEventId" IS NULL)
   OR (kind::text='COMMENT_CREATED' AND "commentId" IS NOT NULL AND "invitationId" IS NULL AND "submissionId" IS NULL AND "reviewEventId" IS NULL)
   OR (kind::text='SUBMISSION_RECEIVED' AND "submissionId" IS NOT NULL AND "invitationId" IS NULL AND "commentId" IS NULL AND "reviewEventId" IS NULL)
   OR (kind::text IN ('SUBMISSION_REVIEWED','SUBMISSION_RESPONDED') AND "reviewEventId" IS NOT NULL AND "submissionId" IS NOT NULL AND "invitationId" IS NULL AND "commentId" IS NULL)))
   OR (kind::text='REDEMPTION_ISSUED' AND "redemptionId" IS NOT NULL AND "invitationId" IS NULL AND "commentId" IS NULL AND "submissionId" IS NULL AND "reviewEventId" IS NULL)))
  OR (kind::text='REDEMPTION_UPDATED' AND "redemptionId" IS NOT NULL AND "redemptionEventId" IS NOT NULL
   AND "invitationId" IS NULL AND "commentId" IS NULL AND "submissionId" IS NULL AND "reviewEventId" IS NULL)))
 OR (kind::text='ALBUM_PUBLISHED' AND "albumEventId" IS NOT NULL AND "redemptionId" IS NOT NULL AND "redemptionEventId" IS NULL
  AND "invitationId" IS NULL AND "commentId" IS NULL AND "submissionId" IS NULL AND "reviewEventId" IS NULL));

CREATE FUNCTION app.guard_album_projection() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.version<>1 OR NEW."nextPosition"<>1 THEN
   RAISE EXCEPTION 'Album starts at version and position one' USING ERRCODE='23514';
  END IF;
 ELSIF (to_jsonb(NEW)-ARRAY['version','nextPosition']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['version','nextPosition'])
 OR NEW.version<>OLD.version+1 OR NEW."nextPosition"<OLD."nextPosition" THEN
  RAISE EXCEPTION 'Album identity is immutable and version advances once' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$fn$;
CREATE TRIGGER guard_album_projection BEFORE INSERT OR UPDATE ON "TicketAlbum"
 FOR EACH ROW EXECUTE FUNCTION app.guard_album_projection();

CREATE FUNCTION app.validate_album_origin() RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE source app."Redemption"; collection app."MediaCollection"; album app."TicketAlbum";
BEGIN
 IF TG_TABLE_NAME='MediaCollection' THEN
  IF NEW.purpose::text<>'MEMORY' THEN RETURN NULL; END IF;
  SELECT * INTO album FROM app."TicketAlbum" WHERE "collectionId"=NEW.id;
 ELSE
  SELECT * INTO album FROM app."TicketAlbum" WHERE id=NEW.id;
 END IF;
 SELECT * INTO source FROM app."Redemption" WHERE id=album."redemptionId";
 SELECT * INTO collection FROM app."MediaCollection" WHERE id=album."collectionId";
 IF album.id IS NULL OR source.id IS NULL OR collection.id IS NULL OR collection.purpose::text<>'MEMORY'
 OR collection."subjectId"<>source.id OR collection."storeId"<>source."storeId"
 OR collection."participantMembershipId"<>source."participantMembershipId"
 OR album."storeId"<>source."storeId" OR album."participantMembershipId"<>source."participantMembershipId"
 OR source.status::text='CANCELLED' OR (collection."retentionUntil" IS NOT NULL AND collection."retentionUntil"<=clock_timestamp())
 OR NOT EXISTS (SELECT 1 FROM app."Membership" m JOIN app."Profile" p ON p.id=m."profileId"
  WHERE m."storeId"=album."storeId" AND m."profileId"=album."createdByProfileId" AND m.role::text='MERCHANT'
  AND m."accessRevokedAt" IS NULL AND p."suspendedAt" IS NULL)
 OR NOT EXISTS (SELECT 1 FROM app."Membership" m JOIN app."Profile" p ON p.id=m."profileId"
  WHERE m.id=album."participantMembershipId" AND m.role::text='PARTICIPANT' AND m."accessRevokedAt" IS NULL AND p."suspendedAt" IS NULL) THEN
  RAISE EXCEPTION 'Memory requires its real ticket album and current merchant' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END;
$fn$;
CREATE CONSTRAINT TRIGGER validate_album_origin AFTER INSERT ON "TicketAlbum"
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.validate_album_origin();
-- Somente inserções novas: coleções MEMORY históricas fictícias não são apagadas.
CREATE CONSTRAINT TRIGGER validate_memory_origin AFTER INSERT ON "MediaCollection"
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.validate_album_origin();

CREATE FUNCTION app.validate_album_projection() RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE event app."AlbumEvent"; n integer; first_position integer; last_position integer;
BEGIN
 SELECT * INTO event FROM app."AlbumEvent" WHERE "albumId"=NEW.id AND version=NEW.version;
 SELECT count(*),min(position),max(position) INTO n,first_position,last_position FROM app."AlbumItem" WHERE "publicationId"=event.id;
 IF event.id IS NULL OR (event.kind='REMOVE' AND NEW."nextPosition"<>OLD."nextPosition")
 OR (event.kind='PUBLISH' AND (n NOT BETWEEN 1 AND 10 OR first_position<>OLD."nextPosition"
  OR last_position<>NEW."nextPosition"-1 OR NEW."nextPosition"<>OLD."nextPosition"+n)) THEN
  RAISE EXCEPTION 'Album projection requires its exact ordered event' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END;
$fn$;
CREATE CONSTRAINT TRIGGER validate_album_projection AFTER UPDATE ON "TicketAlbum"
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.validate_album_projection();

CREATE FUNCTION app.validate_album_event() RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE album app."TicketAlbum"; collection app."MediaCollection"; source app."Redemption";
 previous app."AlbumEvent"; asset app."MediaAsset"; n integer; first_position integer; last_position integer;
BEGIN
 SELECT * INTO album FROM app."TicketAlbum" WHERE id=NEW."albumId";
 SELECT * INTO collection FROM app."MediaCollection" WHERE id=album."collectionId";
 SELECT * INTO source FROM app."Redemption" WHERE id=album."redemptionId";
 SELECT * INTO previous FROM app."AlbumEvent" WHERE "albumId"=album.id AND version=NEW.version-1;
 IF album.id IS NULL OR source.id IS NULL OR collection.id IS NULL OR album.version<>NEW.version
 OR NEW."actorProfileId"<>album."createdByProfileId" OR NEW."createdAt"<album."createdAt"
 OR (NEW.version>2 AND (previous.id IS NULL OR NEW."createdAt"<previous."createdAt"))
 OR NOT EXISTS (SELECT 1 FROM app."Membership" m JOIN app."Profile" p ON p.id=m."profileId"
  WHERE m."storeId"=album."storeId" AND m."profileId"=NEW."actorProfileId" AND m.role::text='MERCHANT'
  AND m."accessRevokedAt" IS NULL AND p."suspendedAt" IS NULL)
 OR NOT EXISTS (SELECT 1 FROM app."Membership" m JOIN app."Profile" p ON p.id=m."profileId"
  WHERE m.id=album."participantMembershipId" AND m."accessRevokedAt" IS NULL AND p."suspendedAt" IS NULL) THEN
  RAISE EXCEPTION 'Album event requires ordered current merchant authorship' USING ERRCODE='23514';
 END IF;
 IF NEW.kind='PUBLISH' THEN
  SELECT count(*),min(position),max(position) INTO n,first_position,last_position FROM app."AlbumItem" WHERE "publicationId"=NEW.id;
  IF source.status::text='CANCELLED' OR (collection."retentionUntil" IS NOT NULL AND collection."retentionUntil"<=clock_timestamp())
  OR n NOT BETWEEN 1 AND 10 OR last_position-first_position+1<>n OR last_position<>album."nextPosition"-1
  OR NOT EXISTS (SELECT 1 FROM app."OutboxEvent" e WHERE e."albumEventId"=NEW.id AND e.kind::text='ALBUM_PUBLISHED'
   AND e.key='album.published:'||NEW.id::text AND e."redemptionId"=album."redemptionId" AND e."storeId"=album."storeId"
   AND e."participantMembershipId"=album."participantMembershipId" AND e."actorProfileId"=NEW."actorProfileId"
   AND e."recipientMembershipId"=album."participantMembershipId") THEN
   RAISE EXCEPTION 'Publication requires ready ordered items and private outbox' USING ERRCODE='23514';
  END IF;
 ELSE
  SELECT * INTO asset FROM app."MediaAsset" WHERE id=NEW."removedAssetId";
  IF asset.id IS NULL OR asset."collectionId"<>album."collectionId" OR asset."authorProfileId"<>NEW."actorProfileId"
  OR asset."removedAt" IS DISTINCT FROM NEW."createdAt" OR asset.state::text NOT IN ('REMOVING','REMOVED')
  OR EXISTS (SELECT 1 FROM app."AlbumItem" WHERE "publicationId"=NEW.id)
  OR EXISTS (SELECT 1 FROM app."OutboxEvent" WHERE "albumEventId"=NEW.id) THEN
   RAISE EXCEPTION 'Removal requires its author and hidden asset' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NULL;
END;
$fn$;
CREATE CONSTRAINT TRIGGER validate_album_event AFTER INSERT ON "AlbumEvent"
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.validate_album_event();

CREATE FUNCTION app.validate_album_item() RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE album app."TicketAlbum"; event app."AlbumEvent"; asset app."MediaAsset";
BEGIN
 SELECT * INTO album FROM app."TicketAlbum" WHERE id=NEW."albumId";
 SELECT * INTO event FROM app."AlbumEvent" WHERE id=NEW."publicationId" AND xmin=pg_current_xact_id()::text::xid;
 SELECT * INTO asset FROM app."MediaAsset" WHERE id=NEW."assetId" AND xmin=pg_current_xact_id()::text::xid;
 IF event.id IS NULL OR event.kind<>'PUBLISH' OR asset.id IS NULL OR asset."collectionId"<>album."collectionId"
 OR asset."authorProfileId"<>event."actorProfileId" OR asset.state::text<>'READY' OR asset."removedAt" IS NOT NULL
 OR asset."publishedAt" IS NULL OR asset."publishedAt"<event."createdAt"
 OR NEW."createdAt" IS DISTINCT FROM event."createdAt" THEN
  RAISE EXCEPTION 'Album item requires its same-transaction ready publication' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END;
$fn$;
CREATE CONSTRAINT TRIGGER validate_album_item AFTER INSERT ON "AlbumItem"
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.validate_album_item();

CREATE FUNCTION app.guard_memory_asset() RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE collection app."MediaCollection"; album app."TicketAlbum"; source app."Redemption"; occupied integer;
BEGIN
 SELECT * INTO collection FROM app."MediaCollection" WHERE id=NEW."collectionId";
 IF collection.purpose::text<>'MEMORY' THEN RETURN NEW; END IF;
 IF TG_OP='INSERT' THEN
  PERFORM id FROM app."Store" WHERE id=collection."storeId" FOR UPDATE;
  SELECT * INTO album FROM app."TicketAlbum" WHERE "collectionId"=collection.id;
  SELECT * INTO source FROM app."Redemption" WHERE id=album."redemptionId";
  SELECT count(*) INTO occupied FROM app."MediaAsset" WHERE "collectionId"=collection.id AND "removedAt" IS NULL;
  IF album.id IS NULL OR source.id IS NULL OR source.status::text='CANCELLED' OR occupied>=20
  OR NEW."removedAt" IS NOT NULL OR NEW."purgedAt" IS NOT NULL
  OR NEW."authorProfileId"<>album."createdByProfileId" OR NEW.revision<>collection.revision
  OR (collection."retentionUntil" IS NOT NULL AND collection."retentionUntil"<=clock_timestamp())
  OR NOT EXISTS (SELECT 1 FROM app."Membership" m JOIN app."Profile" p ON p.id=m."profileId"
   WHERE m."storeId"=album."storeId" AND m."profileId"=NEW."authorProfileId" AND m.role::text='MERCHANT'
   AND m."accessRevokedAt" IS NULL AND p."suspendedAt" IS NULL)
  OR NOT EXISTS (SELECT 1 FROM app."Membership" m JOIN app."Profile" p ON p.id=m."profileId"
   WHERE m.id=album."participantMembershipId" AND m."accessRevokedAt" IS NULL AND p."suspendedAt" IS NULL) THEN
   RAISE EXCEPTION 'Memory reservation requires its available album and capacity' USING ERRCODE='23514';
  END IF;
 ELSIF (OLD."publishedAt" IS NOT NULL AND NEW."publishedAt" IS DISTINCT FROM OLD."publishedAt")
 OR (OLD."removedAt" IS NOT NULL AND NEW."removedAt" IS DISTINCT FROM OLD."removedAt") THEN
  RAISE EXCEPTION 'Memory publication and removal timestamps are immutable' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$fn$;
CREATE TRIGGER guard_memory_asset BEFORE INSERT OR UPDATE ON "MediaAsset"
 FOR EACH ROW EXECUTE FUNCTION app.guard_memory_asset();

CREATE FUNCTION app.validate_memory_change() RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE collection app."MediaCollection"; item app."AlbumItem"; event app."AlbumEvent";
BEGIN
 SELECT * INTO collection FROM app."MediaCollection" WHERE id=NEW."collectionId";
 IF collection.purpose::text<>'MEMORY' THEN RETURN NULL; END IF;
 IF NEW."publishedAt" IS NOT NULL AND (TG_OP='INSERT' OR OLD."publishedAt" IS NULL) THEN
  SELECT * INTO item FROM app."AlbumItem" WHERE "assetId"=NEW.id;
  SELECT * INTO event FROM app."AlbumEvent" WHERE id=item."publicationId" AND xmin=pg_current_xact_id()::text::xid;
  IF item."assetId" IS NULL OR event.id IS NULL OR event.kind<>'PUBLISH' OR NEW.state::text<>'READY'
   OR NEW."removedAt" IS NOT NULL OR NEW."publishedAt"<event."createdAt" THEN
   RAISE EXCEPTION 'Memory publication requires its album item and event' USING ERRCODE='23514';
  END IF;
 END IF;
 IF TG_OP='UPDATE' AND OLD."removedAt" IS NULL AND NEW."removedAt" IS NOT NULL THEN
  IF NOT EXISTS (SELECT 1 FROM app."AlbumEvent" e JOIN app."TicketAlbum" a ON a.id=e."albumId"
   WHERE e."removedAssetId"=NEW.id AND e.kind='REMOVE' AND a."collectionId"=collection.id
   AND e."actorProfileId"=NEW."authorProfileId" AND e."createdAt"=NEW."removedAt")
  AND NOT (OLD."publishedAt" IS NULL AND OLD."lastActivityAt"<=clock_timestamp()-interval '24 hours')
  AND NOT COALESCE(OLD."publishedAt" IS NOT NULL AND NOT collection."retentionHold" AND collection."retentionUntil"<=clock_timestamp(),false) THEN
   RAISE EXCEPTION 'Memory removal requires author audit or due retention' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NULL;
END;
$fn$;
CREATE CONSTRAINT TRIGGER validate_memory_change AFTER INSERT OR UPDATE ON "MediaAsset"
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.validate_memory_change();

CREATE FUNCTION app.validate_album_outbox() RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE event app."AlbumEvent"; album app."TicketAlbum";
BEGIN
 SELECT * INTO event FROM app."AlbumEvent" WHERE id=NEW."albumEventId";
 SELECT * INTO album FROM app."TicketAlbum" WHERE id=event."albumId";
 IF event.id IS NULL OR album.id IS NULL OR event.kind<>'PUBLISH' OR NEW."redemptionId"<>album."redemptionId"
 OR NEW."storeId"<>album."storeId" OR NEW."participantMembershipId"<>album."participantMembershipId"
 OR NEW."recipientMembershipId"<>album."participantMembershipId" OR NEW."actorProfileId"<>event."actorProfileId"
 OR NEW.key<>'album.published:'||event.id::text THEN
  RAISE EXCEPTION 'Album notification requires its exact private publication audience' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$fn$;
CREATE TRIGGER validate_album_outbox BEFORE INSERT ON "OutboxEvent"
 FOR EACH ROW WHEN (NEW.kind::text='ALBUM_PUBLISHED') EXECUTE FUNCTION app.validate_album_outbox();

CREATE FUNCTION app.preserve_album_history() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
 RAISE EXCEPTION 'Published album history is immutable' USING ERRCODE='23514';
END;
$fn$;
CREATE TRIGGER preserve_album_event BEFORE UPDATE ON "AlbumEvent"
 FOR EACH ROW EXECUTE FUNCTION app.preserve_album_history();
CREATE TRIGGER preserve_album_item BEFORE UPDATE ON "AlbumItem"
 FOR EACH ROW EXECUTE FUNCTION app.preserve_album_history();

REVOKE ALL ON "TicketAlbum","AlbumEvent","AlbumItem" FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON "TicketAlbum","AlbumEvent","AlbumItem" TO meumimo_runtime;
GRANT UPDATE (version,"nextPosition") ON "TicketAlbum" TO meumimo_runtime;
ALTER TABLE "TicketAlbum" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AlbumEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AlbumItem" ENABLE ROW LEVEL SECURITY;
CREATE POLICY runtime_ticket_album ON "TicketAlbum" TO meumimo_runtime USING (true) WITH CHECK (true);
CREATE POLICY runtime_album_event ON "AlbumEvent" TO meumimo_runtime USING (true) WITH CHECK (true);
CREATE POLICY runtime_album_item ON "AlbumItem" TO meumimo_runtime USING (true) WITH CHECK (true);
REVOKE ALL ON FUNCTION app.guard_album_projection(),app.validate_album_origin(),app.validate_album_projection(),
 app.validate_album_event(),app.validate_album_item(),app.guard_memory_asset(),app.validate_memory_change(),app.validate_album_outbox(),
 app.preserve_album_history() FROM PUBLIC;
COMMIT;
