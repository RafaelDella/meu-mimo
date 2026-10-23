BEGIN;
SET LOCAL search_path=app;
CREATE TYPE "DataRightsKind" AS ENUM ('EXPORT','ERASURE');
CREATE TYPE "DataRightsCode" AS ENUM ('REGISTERED','EXPORT_READY','SUPPRESSION_APPLIED','AUTH_REMOVED','MEDIA_PURGED','PARTIAL','EXPIRED');
CREATE TYPE "DataSuppressionScope" AS ENUM ('IDENTITY','AUTHORED_CONTENT');
CREATE TABLE "DataRightsProtocol" (
 id uuid PRIMARY KEY,
 "subjectProfileId" uuid NOT NULL REFERENCES "Profile"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
 "operatorProfileId" uuid NOT NULL REFERENCES "Profile"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
 kind "DataRightsKind" NOT NULL, "requestDigest" text NOT NULL,
 "verifiedAt" timestamptz(6) NOT NULL, "createdAt" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "expiresAt" timestamptz(6),
 CONSTRAINT "DataRightsProtocol_digest_check" CHECK ("requestDigest" ~ '^[a-f0-9]{64}$'),
 CONSTRAINT "DataRightsProtocol_time_check" CHECK ("verifiedAt"<="createdAt" AND ("expiresAt" IS NULL OR "expiresAt">"createdAt")),
 CONSTRAINT "DataRightsProtocol_id_subjectProfileId_key" UNIQUE(id,"subjectProfileId")
);
CREATE INDEX "DataRightsProtocol_subjectProfileId_createdAt_id_idx" ON "DataRightsProtocol"("subjectProfileId","createdAt",id);
CREATE TABLE "DataRightsEvent" (
 id uuid PRIMARY KEY, "protocolId" uuid NOT NULL REFERENCES "DataRightsProtocol"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
 sequence integer NOT NULL CHECK (sequence>=1), code "DataRightsCode" NOT NULL,
 "createdAt" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP, "countsJson" jsonb NOT NULL DEFAULT '{}',
 CONSTRAINT "DataRightsEvent_protocolId_sequence_key" UNIQUE("protocolId",sequence)
);
CREATE TABLE "DataSuppression" (
 "subjectProfileId" uuid NOT NULL REFERENCES "Profile"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
 scope "DataSuppressionScope" NOT NULL, "protocolId" uuid NOT NULL,
 "createdAt" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY("subjectProfileId",scope),
 CONSTRAINT "DataSuppression_protocol_subject_fkey" FOREIGN KEY("protocolId","subjectProfileId")
  REFERENCES "DataRightsProtocol"(id,"subjectProfileId") ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE FUNCTION app.data_rights_counts_valid(value jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,app,pg_temp AS $fn$
DECLARE item record;
BEGIN
 IF value IS NULL OR jsonb_typeof(value)<>'object' THEN RETURN false; END IF;
 FOR item IN SELECT * FROM jsonb_each(value) LOOP
  IF item.key<>ALL(ARRAY['profiles','sessions','grants','mediaQueued','mediaHeld','mediaPurged',
   'authIdentities','records','files','bytes','backups','exports','pending'])
  OR jsonb_typeof(item.value)<>'number' OR item.value::text !~ '^(0|[1-9][0-9]{0,15})$' THEN RETURN false; END IF;
  IF item.value::text::numeric>9007199254740991 THEN RETURN false; END IF;
 END LOOP;
 RETURN true;
END;
$fn$;
ALTER TABLE "DataRightsEvent" ADD CONSTRAINT "DataRightsEvent_counts_check" CHECK(app.data_rights_counts_valid("countsJson"));

DO $body$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='meumimo_rights_operator') THEN
  CREATE ROLE meumimo_rights_operator NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
 END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='meumimo_rights_operator'
  AND (rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR rolinherit OR rolbypassrls)) THEN
  RAISE EXCEPTION 'Rights operator requires restricted role flags' USING ERRCODE='23514';
 END IF;
END;
$body$;
GRANT USAGE ON SCHEMA app TO meumimo_rights_operator;
REVOKE ALL ON "DataRightsProtocol","DataRightsEvent","DataSuppression" FROM PUBLIC,anon,authenticated;
GRANT SELECT ON "DataRightsProtocol","DataRightsEvent","DataSuppression" TO meumimo_runtime,meumimo_rights_operator;
GRANT INSERT(id,"subjectProfileId","operatorProfileId",kind,"requestDigest","verifiedAt","expiresAt") ON "DataRightsProtocol" TO meumimo_rights_operator;
GRANT INSERT(id,"protocolId",sequence,code,"countsJson") ON "DataRightsEvent" TO meumimo_rights_operator;
GRANT INSERT("subjectProfileId",scope,"protocolId") ON "DataSuppression" TO meumimo_rights_operator;
ALTER TABLE "DataRightsProtocol" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DataRightsEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DataSuppression" ENABLE ROW LEVEL SECURITY;
CREATE POLICY runtime_rights_protocol ON "DataRightsProtocol" FOR SELECT TO meumimo_runtime USING(true);
CREATE POLICY runtime_rights_event ON "DataRightsEvent" FOR SELECT TO meumimo_runtime USING(true);
CREATE POLICY runtime_data_suppression ON "DataSuppression" FOR SELECT TO meumimo_runtime USING(true);
CREATE POLICY operator_rights_protocol ON "DataRightsProtocol" TO meumimo_rights_operator USING(true) WITH CHECK(true);
CREATE POLICY operator_rights_event ON "DataRightsEvent" TO meumimo_rights_operator USING(true) WITH CHECK(true);
CREATE POLICY operator_data_suppression ON "DataSuppression" TO meumimo_rights_operator USING(true) WITH CHECK(true);

CREATE FUNCTION app.guard_data_rights_immutable() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
 IF TG_OP='UPDATE' OR current_user IN ('meumimo_runtime','meumimo_rights_operator') THEN
  RAISE EXCEPTION 'Data rights records are append-only' USING ERRCODE='23514'; END IF;
 -- A credencial privilegiada de fixture pode limpar somente seus próprios IDs.
 RETURN OLD;
END;
$fn$;
CREATE TRIGGER preserve_data_rights_protocol BEFORE UPDATE OR DELETE ON "DataRightsProtocol"
 FOR EACH ROW EXECUTE FUNCTION app.guard_data_rights_immutable();
CREATE TRIGGER preserve_data_rights_event BEFORE UPDATE OR DELETE ON "DataRightsEvent"
 FOR EACH ROW EXECUTE FUNCTION app.guard_data_rights_immutable();
CREATE TRIGGER preserve_data_suppression BEFORE UPDATE OR DELETE ON "DataSuppression"
 FOR EACH ROW EXECUTE FUNCTION app.guard_data_rights_immutable();
CREATE FUNCTION app.guard_data_rights_insert() RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE protocol app."DataRightsProtocol"; prior integer;
BEGIN
 SELECT * INTO protocol FROM app."DataRightsProtocol" WHERE id=NEW."protocolId";
 IF TG_TABLE_NAME='DataSuppression' THEN
  IF protocol.kind IS DISTINCT FROM 'ERASURE'::app."DataRightsKind" THEN
   RAISE EXCEPTION 'Suppression requires erasure protocol' USING ERRCODE='23514'; END IF;
 ELSE
  PERFORM pg_advisory_xact_lock(hashtextextended('meumimo:t14:rights:'||NEW."protocolId"::text,0));
  SELECT COALESCE(max(sequence),0) INTO prior FROM app."DataRightsEvent" WHERE "protocolId"=NEW."protocolId";
  IF NEW.sequence<>prior::bigint+1 OR (prior=0 AND NEW.code<>'REGISTERED') OR (prior>0 AND NEW.code='REGISTERED')
  OR (NEW.code IN ('EXPORT_READY','EXPIRED') AND protocol.kind<>'EXPORT')
  OR (NEW.code IN ('SUPPRESSION_APPLIED','AUTH_REMOVED','MEDIA_PURGED') AND protocol.kind<>'ERASURE') THEN
   RAISE EXCEPTION 'Rights event requires ordered compatible protocol' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END;
$fn$;
CREATE TRIGGER guard_data_suppression_insert BEFORE INSERT ON "DataSuppression" FOR EACH ROW EXECUTE FUNCTION app.guard_data_rights_insert();
CREATE TRIGGER guard_data_rights_event_insert BEFORE INSERT ON "DataRightsEvent" FOR EACH ROW EXECUTE FUNCTION app.guard_data_rights_insert();

CREATE FUNCTION app.data_erasure_authorized(subject uuid, requested_scope app."DataSuppressionScope") RETURNS boolean
LANGUAGE sql STABLE SET search_path=pg_catalog,app,pg_temp AS $fn$
 SELECT EXISTS(SELECT 1 FROM app."DataSuppression" s JOIN app."DataRightsProtocol" p
  ON p.id=s."protocolId" AND p."subjectProfileId"=s."subjectProfileId"
  WHERE s."subjectProfileId"=subject AND s.scope=requested_scope AND p.kind='ERASURE');
$fn$;
GRANT SELECT(id,"displayName") ON "Profile" TO meumimo_rights_operator;
GRANT UPDATE("displayName") ON "Profile" TO meumimo_rights_operator;
GRANT SELECT(id,"profileId","revokedAt") ON "AuthSession" TO meumimo_rights_operator;
GRANT SELECT("profileId","revokedAt") ON "AdminGrant" TO meumimo_rights_operator;
GRANT UPDATE("revokedAt") ON "AuthSession","AdminGrant" TO meumimo_rights_operator;
-- guard_memory_asset T11 consulta a linha da coleção, sem conteúdo livre/bytes.
GRANT SELECT ON "MediaCollection" TO meumimo_rights_operator;
-- PG17 exige UPDATE para FOR SHARE; o trigger abaixo nega toda mutação efetiva.
GRANT UPDATE(id) ON "MediaCollection" TO meumimo_rights_operator;
GRANT SELECT(id,"collectionId","authorProfileId",state,"removedAt","purgedAt","availableAt","leaseToken","leaseUntil") ON "MediaAsset" TO meumimo_rights_operator;
GRANT UPDATE(state,"removedAt","availableAt","leaseToken") ON "MediaAsset" TO meumimo_rights_operator;
CREATE POLICY operator_rights_profile ON "Profile" TO meumimo_rights_operator USING(true) WITH CHECK(true);
CREATE POLICY operator_rights_session ON "AuthSession" TO meumimo_rights_operator USING(true) WITH CHECK(true);
CREATE POLICY operator_rights_grant ON "AdminGrant" TO meumimo_rights_operator USING(true) WITH CHECK(true);
CREATE POLICY operator_rights_collection ON "MediaCollection" TO meumimo_rights_operator USING(true) WITH CHECK(true);
CREATE POLICY operator_rights_asset ON "MediaAsset" TO meumimo_rights_operator USING(true) WITH CHECK(true);
CREATE FUNCTION app.guard_data_erasure_projection() RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE subject uuid; collection app."MediaCollection";
BEGIN
 IF current_user<>'meumimo_rights_operator' THEN RETURN NEW; END IF;
 IF TG_TABLE_NAME='MediaCollection' THEN
  RAISE EXCEPTION 'Rights collection privilege is lock-only' USING ERRCODE='42501';
 ELSIF TG_TABLE_NAME='Profile' THEN
  IF NEW."displayName" IS DISTINCT FROM 'Conta removida' THEN
   RAISE EXCEPTION 'Rights identity projection is fixed' USING ERRCODE='23514'; END IF;
  subject:=NEW.id;
 ELSIF TG_TABLE_NAME IN ('AuthSession','AdminGrant') THEN
  IF NEW."revokedAt" IS NULL OR (OLD."revokedAt" IS NOT NULL AND NEW."revokedAt" IS DISTINCT FROM OLD."revokedAt") THEN
   RAISE EXCEPTION 'Rights can only revoke active access' USING ERRCODE='23514'; END IF;
  subject:=NEW."profileId";
 ELSE
  SELECT * INTO collection FROM app."MediaCollection" WHERE id=NEW."collectionId" FOR SHARE;
  IF collection."retentionHold" OR OLD."removedAt" IS NOT NULL OR NEW."removedAt" IS NULL
  OR NEW.state<>'REMOVING' OR NEW."availableAt" IS DISTINCT FROM NEW."removedAt" OR NEW."leaseToken" IS NOT NULL THEN
   RAISE EXCEPTION 'Rights media projection requires unheld removal' USING ERRCODE='23514'; END IF;
  IF NOT app.data_erasure_authorized(NEW."authorProfileId",'AUTHORED_CONTENT') THEN
   RAISE EXCEPTION 'Rights media requires authored suppression' USING ERRCODE='23514'; END IF;
  RETURN NEW;
 END IF;
 IF NOT app.data_erasure_authorized(subject,'IDENTITY') THEN
  RAISE EXCEPTION 'Rights access requires identity suppression' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END;
$fn$;
CREATE TRIGGER guard_rights_profile BEFORE UPDATE ON "Profile" FOR EACH ROW EXECUTE FUNCTION app.guard_data_erasure_projection();
CREATE TRIGGER guard_rights_session BEFORE UPDATE ON "AuthSession" FOR EACH ROW EXECUTE FUNCTION app.guard_data_erasure_projection();
CREATE TRIGGER guard_rights_grant BEFORE UPDATE ON "AdminGrant" FOR EACH ROW EXECUTE FUNCTION app.guard_data_erasure_projection();
CREATE TRIGGER guard_rights_collection BEFORE UPDATE ON "MediaCollection" FOR EACH ROW EXECUTE FUNCTION app.guard_data_erasure_projection();
CREATE TRIGGER guard_rights_asset BEFORE UPDATE ON "MediaAsset" FOR EACH ROW EXECUTE FUNCTION app.guard_data_erasure_projection();

-- Evolução aditiva T11: nenhuma alteração em AlbumEvent/Item ou no fluxo autoral.
CREATE OR REPLACE FUNCTION app.validate_memory_change() RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE collection app."MediaCollection"; item app."AlbumItem"; event app."AlbumEvent";
BEGIN
 SELECT * INTO collection FROM app."MediaCollection" WHERE id=NEW."collectionId";
 IF collection.purpose::text<>'MEMORY' THEN RETURN NULL; END IF;
 IF NEW."publishedAt" IS NOT NULL AND (TG_OP='INSERT' OR OLD."publishedAt" IS NULL) THEN
  SELECT * INTO item FROM app."AlbumItem" WHERE "assetId"=NEW.id;
  SELECT * INTO event FROM app."AlbumEvent" WHERE id=item."publicationId" AND xmin=pg_current_xact_id()::text::xid;
  IF item."assetId" IS NULL OR event.id IS NULL OR event.kind<>'PUBLISH' OR NEW.state::text<>'READY'
   OR NEW."removedAt" IS NOT NULL OR NEW."publishedAt"<event."createdAt" THEN
   RAISE EXCEPTION 'Memory publication requires its album item and event' USING ERRCODE='23514'; END IF;
 END IF;
 IF TG_OP='UPDATE' AND OLD."removedAt" IS NULL AND NEW."removedAt" IS NOT NULL THEN
  IF current_user='meumimo_rights_operator' AND NOT collection."retentionHold" THEN
   IF app.data_erasure_authorized(NEW."authorProfileId",'AUTHORED_CONTENT') THEN RETURN NULL; END IF;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM app."AlbumEvent" e JOIN app."TicketAlbum" a ON a.id=e."albumId"
   WHERE e."removedAssetId"=NEW.id AND e.kind='REMOVE' AND a."collectionId"=collection.id
   AND e."actorProfileId"=NEW."authorProfileId" AND e."createdAt"=NEW."removedAt")
  AND NOT (OLD."publishedAt" IS NULL AND OLD."lastActivityAt"<=clock_timestamp()-interval '24 hours')
  AND NOT COALESCE(OLD."publishedAt" IS NOT NULL AND NOT collection."retentionHold" AND collection."retentionUntil"<=clock_timestamp(),false) THEN
   RAISE EXCEPTION 'Memory removal requires author audit or due retention' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NULL;
END;
$fn$;

CREATE FUNCTION app.apply_data_erasure(p_protocol uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,app,pg_temp AS $fn$
DECLARE protocol app."DataRightsProtocol"; result jsonb; n_profiles integer; n_sessions integer; n_grants integer;
 n_queued integer; n_held integer; prior integer;
BEGIN
 IF current_user<>'meumimo_rights_operator' OR current_setting('transaction_isolation')<>'read committed' THEN
  RAISE EXCEPTION 'Data erasure requires operational role and read committed' USING ERRCODE='M1400'; END IF;
 SELECT * INTO protocol FROM app."DataRightsProtocol" WHERE id=p_protocol;
 IF protocol.id IS NULL OR protocol.kind<>'ERASURE' OR
  (SELECT count(*) FROM app."DataSuppression" WHERE "protocolId"=p_protocol AND "subjectProfileId"=protocol."subjectProfileId")<>2
  OR NOT EXISTS(SELECT 1 FROM app."DataRightsEvent" WHERE "protocolId"=p_protocol AND code='REGISTERED') THEN
  RAISE EXCEPTION 'Data erasure requires its protocol and both suppressions' USING ERRCODE='M1400'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('meumimo:t14:subject:'||protocol."subjectProfileId"::text,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('meumimo:t14:rights:'||p_protocol::text,0));
 -- Perfil/sessões precedem coleções e assets; não há trabalho externo nestes locks.
 PERFORM id FROM app."Profile" WHERE id=protocol."subjectProfileId" FOR UPDATE;
 UPDATE app."Profile" SET "displayName"='Conta removida' WHERE id=protocol."subjectProfileId" AND "displayName" IS DISTINCT FROM 'Conta removida';
 GET DIAGNOSTICS n_profiles=ROW_COUNT;
 UPDATE app."AuthSession" SET "revokedAt"=clock_timestamp() WHERE "profileId"=protocol."subjectProfileId" AND "revokedAt" IS NULL;
 GET DIAGNOSTICS n_sessions=ROW_COUNT;
 UPDATE app."AdminGrant" SET "revokedAt"=clock_timestamp() WHERE "profileId"=protocol."subjectProfileId" AND "revokedAt" IS NULL;
 GET DIAGNOSTICS n_grants=ROW_COUNT;
 PERFORM c.id FROM app."MediaCollection" c WHERE EXISTS(SELECT 1 FROM app."MediaAsset" a
  WHERE a."collectionId"=c.id AND a."authorProfileId"=protocol."subjectProfileId" AND a."removedAt" IS NULL)
  ORDER BY c."storeId",c.id FOR SHARE;
 SELECT count(*)::integer INTO n_held FROM app."MediaAsset" a JOIN app."MediaCollection" c ON c.id=a."collectionId"
  WHERE a."authorProfileId"=protocol."subjectProfileId" AND a."removedAt" IS NULL AND c."retentionHold";
 WITH candidates AS (SELECT a.id FROM app."MediaAsset" a JOIN app."MediaCollection" c ON c.id=a."collectionId"
  WHERE a."authorProfileId"=protocol."subjectProfileId" AND a."removedAt" IS NULL AND NOT c."retentionHold"
  ORDER BY a.id FOR UPDATE OF a), instant AS (SELECT clock_timestamp() AS at)
 UPDATE app."MediaAsset" a SET state='REMOVING',"removedAt"=instant.at,"availableAt"=instant.at,"leaseToken"=NULL
  FROM candidates,instant WHERE a.id=candidates.id;
 GET DIAGNOSTICS n_queued=ROW_COUNT;
 result:=jsonb_build_object('profiles',n_profiles,'sessions',n_sessions,'grants',n_grants,'mediaQueued',n_queued,'mediaHeld',n_held);
 IF n_profiles+n_sessions+n_grants+n_queued>0 OR NOT EXISTS(SELECT 1 FROM app."DataRightsEvent" WHERE "protocolId"=p_protocol AND code='SUPPRESSION_APPLIED') THEN
  SELECT COALESCE(max(sequence),0) INTO prior FROM app."DataRightsEvent" WHERE "protocolId"=p_protocol;
  INSERT INTO app."DataRightsEvent"(id,"protocolId",sequence,code,"countsJson") VALUES(gen_random_uuid(),p_protocol,prior+1,'SUPPRESSION_APPLIED',result);
 END IF;
 RETURN result;
END;
$fn$;
REVOKE ALL ON FUNCTION app.data_rights_counts_valid(jsonb),app.guard_data_rights_immutable(),app.guard_data_rights_insert(),
 app.data_erasure_authorized(uuid,app."DataSuppressionScope"),app.guard_data_erasure_projection(),app.apply_data_erasure(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION app.data_rights_counts_valid(jsonb),app.data_erasure_authorized(uuid,app."DataSuppressionScope"),app.apply_data_erasure(uuid) TO meumimo_rights_operator;
COMMIT;
