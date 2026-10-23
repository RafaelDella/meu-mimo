BEGIN;
SET LOCAL search_path=app;
ALTER TABLE "Profile" ADD COLUMN "securityVersion" integer NOT NULL DEFAULT 0 CHECK ("securityVersion">=0);
ALTER TABLE "Store" ADD COLUMN "platformPausedAt" timestamptz(6);
ALTER TABLE "Store" ADD COLUMN "platformVersion" integer NOT NULL DEFAULT 0 CHECK ("platformVersion">=0);
CREATE TABLE "AdminAction" (
 id uuid PRIMARY KEY,
 "actorProfileId" uuid NOT NULL REFERENCES "Profile"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 "targetProfileId" uuid REFERENCES "Profile"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 "targetStoreId" uuid REFERENCES "Store"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 kind text NOT NULL, "expectedVersion" integer NOT NULL, version integer NOT NULL,
 reason text NOT NULL, "requestDigest" text NOT NULL,
 "previousRestrictedAt" timestamptz(6), "restrictedAt" timestamptz(6),
 "createdAt" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "AdminAction_target_check" CHECK (
  ("targetProfileId" IS NOT NULL AND "targetStoreId" IS NULL AND kind IN ('BLOCK_ACCOUNT','UNBLOCK_ACCOUNT'))
  OR ("targetProfileId" IS NULL AND "targetStoreId" IS NOT NULL AND kind IN ('PAUSE_STORE','RESUME_STORE'))),
 CONSTRAINT "AdminAction_version_check" CHECK ("expectedVersion">=0 AND "expectedVersion"<2147483647 AND version="expectedVersion"::bigint+1),
 CONSTRAINT "AdminAction_reason_check" CHECK (char_length(reason) BETWEEN 1 AND 500 AND app.ticket_text_valid(reason) AND reason IS NFC NORMALIZED),
 CONSTRAINT "AdminAction_digest_check" CHECK ("requestDigest" ~ '^[a-f0-9]{64}$'),
 CONSTRAINT "AdminAction_change_check" CHECK (
  (kind IN ('BLOCK_ACCOUNT','PAUSE_STORE') AND "previousRestrictedAt" IS NULL AND "restrictedAt" IS NOT NULL AND "restrictedAt"="createdAt")
  OR (kind IN ('UNBLOCK_ACCOUNT','RESUME_STORE') AND "previousRestrictedAt" IS NOT NULL AND "restrictedAt" IS NULL))
);
CREATE UNIQUE INDEX "AdminAction_targetProfileId_version_key" ON "AdminAction"("targetProfileId",version);
CREATE UNIQUE INDEX "AdminAction_targetStoreId_version_key" ON "AdminAction"("targetStoreId",version);
CREATE INDEX "AdminAction_targetProfileId_createdAt_id_idx" ON "AdminAction"("targetProfileId","createdAt",id);
CREATE INDEX "AdminAction_targetStoreId_createdAt_id_idx" ON "AdminAction"("targetStoreId","createdAt",id);
CREATE INDEX "AdminAction_actorProfileId_createdAt_id_idx" ON "AdminAction"("actorProfileId","createdAt",id);

DO $body$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='meumimo_admin_executor') THEN
  CREATE ROLE meumimo_admin_executor NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
 END IF;
END;
$body$;
GRANT USAGE ON SCHEMA app TO meumimo_admin_executor;
REVOKE ALL ON "AdminAction" FROM PUBLIC,anon,authenticated;
GRANT SELECT ON "AdminAction" TO meumimo_runtime;
GRANT SELECT ON "Profile","AuthSession","AdminGrant","Store","AdminAction" TO meumimo_admin_executor;
GRANT INSERT ON "AdminAction" TO meumimo_admin_executor;
GRANT UPDATE("suspendedAt","securityVersion") ON "Profile" TO meumimo_admin_executor;
GRANT UPDATE("platformPausedAt","platformVersion") ON "Store" TO meumimo_admin_executor;
-- Apenas satisfazem o privilégio requerido por FOR SHARE. O trigger abaixo nega todo UPDATE efetivo desse papel.
GRANT UPDATE(id) ON "AuthSession" TO meumimo_admin_executor;
GRANT UPDATE("profileId") ON "AdminGrant" TO meumimo_admin_executor;
GRANT EXECUTE ON FUNCTION app.ticket_text_valid(text) TO meumimo_admin_executor;
ALTER TABLE "AdminAction" ENABLE ROW LEVEL SECURITY;
CREATE POLICY runtime_admin_audit ON "AdminAction" TO meumimo_runtime USING (true);
CREATE POLICY executor_admin_audit ON "AdminAction" TO meumimo_admin_executor USING (true) WITH CHECK (true);
CREATE POLICY executor_admin_profile ON "Profile" TO meumimo_admin_executor USING (true) WITH CHECK (true);
CREATE POLICY executor_admin_session ON "AuthSession" TO meumimo_admin_executor USING (true) WITH CHECK (true);
CREATE POLICY executor_admin_grant ON "AdminGrant" TO meumimo_admin_executor USING (true) WITH CHECK (true);
CREATE POLICY executor_admin_store ON "Store" TO meumimo_admin_executor USING (true) WITH CHECK (true);

CREATE FUNCTION app.guard_store_admin_initialization() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
 IF current_user='meumimo_runtime' AND (NEW."platformPausedAt" IS NOT NULL OR NEW."platformVersion"<>0) THEN
  RAISE EXCEPTION 'New store requires unrestricted administrative defaults' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$fn$;
CREATE TRIGGER guard_store_admin_initialization BEFORE INSERT ON "Store"
 FOR EACH ROW EXECUTE FUNCTION app.guard_store_admin_initialization();

CREATE FUNCTION app.guard_admin_lock_only() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
 IF current_user='meumimo_admin_executor' THEN
  RAISE EXCEPTION 'Administrative executor cannot change authentication metadata' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END;
$fn$;
CREATE TRIGGER guard_admin_session_lock_only BEFORE UPDATE ON "AuthSession" FOR EACH ROW EXECUTE FUNCTION app.guard_admin_lock_only();
CREATE TRIGGER guard_admin_grant_lock_only BEFORE UPDATE ON "AdminGrant" FOR EACH ROW EXECUTE FUNCTION app.guard_admin_lock_only();

CREATE FUNCTION app.guard_admin_projection() RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE event app."AdminAction"; before_version integer; after_version integer; before_at timestamptz; after_at timestamptz;
BEGIN
 IF current_user<>'meumimo_admin_executor' THEN RETURN NEW; END IF;
 IF TG_TABLE_NAME='Profile' THEN
  before_version:=OLD."securityVersion"; after_version:=NEW."securityVersion";
  before_at:=OLD."suspendedAt"; after_at:=NEW."suspendedAt";
  SELECT * INTO event FROM app."AdminAction" WHERE "targetProfileId"=NEW.id AND version=after_version AND xmin=pg_current_xact_id()::text::xid;
 ELSE
  before_version:=OLD."platformVersion"; after_version:=NEW."platformVersion";
  before_at:=OLD."platformPausedAt"; after_at:=NEW."platformPausedAt";
  SELECT * INTO event FROM app."AdminAction" WHERE "targetStoreId"=NEW.id AND version=after_version AND xmin=pg_current_xact_id()::text::xid;
 END IF;
 IF event.id IS NULL OR after_version<>before_version+1 OR event."expectedVersion"<>before_version
 OR event."previousRestrictedAt" IS DISTINCT FROM before_at OR event."restrictedAt" IS DISTINCT FROM after_at THEN
  RAISE EXCEPTION 'Administrative change requires its atomic audit' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$fn$;
CREATE TRIGGER guard_admin_profile_projection BEFORE UPDATE OF "suspendedAt","securityVersion" ON "Profile"
 FOR EACH ROW EXECUTE FUNCTION app.guard_admin_projection();
CREATE TRIGGER guard_admin_store_projection BEFORE UPDATE OF "platformPausedAt","platformVersion" ON "Store"
 FOR EACH ROW EXECUTE FUNCTION app.guard_admin_projection();

CREATE FUNCTION app.guard_admin_action() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
 IF TG_OP='UPDATE' THEN RAISE EXCEPTION 'Administrative audit is immutable' USING ERRCODE='23514'; END IF;
 IF current_user<>'meumimo_admin_executor' THEN
  RAISE EXCEPTION 'Administrative audit requires the restricted executor' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END;
$fn$;
CREATE TRIGGER guard_admin_action BEFORE INSERT OR UPDATE ON "AdminAction" FOR EACH ROW EXECUTE FUNCTION app.guard_admin_action();
CREATE FUNCTION app.validate_admin_action() RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE latest app."AdminAction"; current_version integer; current_at timestamptz; touched boolean;
BEGIN
 IF NEW."targetProfileId" IS NOT NULL THEN
  SELECT "securityVersion","suspendedAt",xmin=pg_current_xact_id()::text::xid INTO current_version,current_at,touched
   FROM app."Profile" WHERE id=NEW."targetProfileId";
  SELECT * INTO latest FROM app."AdminAction" WHERE "targetProfileId"=NEW."targetProfileId" ORDER BY version DESC LIMIT 1;
 ELSE
  SELECT "platformVersion","platformPausedAt",xmin=pg_current_xact_id()::text::xid INTO current_version,current_at,touched
   FROM app."Store" WHERE id=NEW."targetStoreId";
  SELECT * INTO latest FROM app."AdminAction" WHERE "targetStoreId"=NEW."targetStoreId" ORDER BY version DESC LIMIT 1;
 END IF;
 IF NOT COALESCE(touched,false) OR latest.id IS NULL OR latest.version<>current_version OR latest."restrictedAt" IS DISTINCT FROM current_at THEN
  RAISE EXCEPTION 'Administrative audit requires its matching target projection' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END;
$fn$;
CREATE CONSTRAINT TRIGGER validate_admin_action AFTER INSERT ON "AdminAction" DEFERRABLE INITIALLY DEFERRED
 FOR EACH ROW EXECUTE FUNCTION app.validate_admin_action();

CREATE FUNCTION app.lock_admin_access(p_actor uuid,p_session uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app,pg_temp AS $fn$
DECLARE actor app."Profile"; session app."AuthSession"; permission app."AdminGrant";
BEGIN
 IF p_actor IS NULL OR p_session IS NULL THEN RAISE EXCEPTION 'Administrative session is unavailable' USING ERRCODE='M1301'; END IF;
 SELECT * INTO actor FROM app."Profile" WHERE id=p_actor FOR SHARE;
 IF actor.id IS NULL THEN RAISE EXCEPTION 'Administrative session is unavailable' USING ERRCODE='M1301'; END IF;
 IF actor."suspendedAt" IS NOT NULL THEN RAISE EXCEPTION 'Administrative access is forbidden' USING ERRCODE='M1303'; END IF;
 SELECT * INTO session FROM app."AuthSession" WHERE id=p_session AND "profileId"=p_actor FOR SHARE;
 IF session.id IS NULL OR session."revokedAt" IS NOT NULL THEN
  RAISE EXCEPTION 'Administrative session is unavailable' USING ERRCODE='M1301'; END IF;
 IF session.recovery THEN RAISE EXCEPTION 'Administrative access is forbidden' USING ERRCODE='M1303'; END IF;
 SELECT * INTO permission FROM app."AdminGrant" WHERE "profileId"=p_actor FOR SHARE;
 IF permission."profileId" IS NULL OR permission."revokedAt" IS NOT NULL THEN
  RAISE EXCEPTION 'Administrative access is forbidden' USING ERRCODE='M1303'; END IF;
END;
$fn$;

CREATE FUNCTION app.apply_admin_action(p_actor uuid,p_session uuid,p_operation uuid,p_target_kind text,p_target_id uuid,
 p_kind text,p_expected_version integer,p_reason text,p_digest text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app,pg_temp AS $fn$
DECLARE account app."Profile"; store app."Store"; permission app."AdminGrant"; prior app."AdminAction";
 previous_at timestamptz; desired_at timestamptz; current_version integer; now_at timestamptz;
BEGIN
 IF current_setting('transaction_isolation')<>'read committed' THEN
  RAISE EXCEPTION 'Administrative command requires read committed isolation' USING ERRCODE='M1300';
 END IF;
 IF p_operation IS NULL OR p_target_kind IS NULL OR p_target_id IS NULL OR p_kind IS NULL
 OR p_expected_version IS NULL OR p_expected_version<0 OR p_expected_version>=2147483647
 OR p_reason IS NULL OR char_length(p_reason) NOT BETWEEN 1 AND 500 OR NOT app.ticket_text_valid(p_reason) OR p_reason IS NOT NFC NORMALIZED
 OR p_digest IS NULL OR p_digest !~ '^[a-f0-9]{64}$'
 OR NOT ((p_target_kind='ACCOUNT' AND p_kind IN ('BLOCK_ACCOUNT','UNBLOCK_ACCOUNT'))
 OR (p_target_kind='STORE' AND p_kind IN ('PAUSE_STORE','RESUME_STORE'))) THEN
  RAISE EXCEPTION 'Administrative input is invalid' USING ERRCODE='M1300';
 END IF;
 PERFORM app.lock_admin_access(p_actor,p_session);
 IF p_target_kind='ACCOUNT' THEN
  SELECT * INTO account FROM app."Profile" WHERE id=p_target_id FOR UPDATE;
  IF account.id IS NULL THEN RAISE EXCEPTION 'Administrative target is unavailable' USING ERRCODE='M1304'; END IF;
  SELECT * INTO permission FROM app."AdminGrant" WHERE "profileId"=p_target_id FOR SHARE;
  current_version:=account."securityVersion"; previous_at:=account."suspendedAt";
 ELSE
  SELECT * INTO store FROM app."Store" WHERE id=p_target_id FOR UPDATE;
  IF store.id IS NULL THEN RAISE EXCEPTION 'Administrative target is unavailable' USING ERRCODE='M1304'; END IF;
  current_version:=store."platformVersion"; previous_at:=store."platformPausedAt";
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('meumimo:t13:admin-operation:'||p_operation::text,0));
 SELECT * INTO prior FROM app."AdminAction" WHERE id=p_operation;
 IF prior.id IS NOT NULL THEN
  IF prior."actorProfileId"<>p_actor OR prior.kind<>p_kind OR prior."expectedVersion"<>p_expected_version
  OR prior.reason<>p_reason OR prior."requestDigest"<>p_digest
  OR (p_target_kind='ACCOUNT' AND (prior."targetProfileId" IS DISTINCT FROM p_target_id OR prior."targetStoreId" IS NOT NULL))
  OR (p_target_kind='STORE' AND (prior."targetStoreId" IS DISTINCT FROM p_target_id OR prior."targetProfileId" IS NOT NULL)) THEN
   RAISE EXCEPTION 'Administrative operation conflicts with recorded intent' USING ERRCODE='M1309';
  END IF;
  RETURN prior.id;
 END IF;
 IF p_kind='BLOCK_ACCOUNT' AND (p_target_id=p_actor OR (permission."profileId" IS NOT NULL AND permission."revokedAt" IS NULL)) THEN
  RAISE EXCEPTION 'Administrative target is protected' USING ERRCODE='M1303'; END IF;
 IF current_version<>p_expected_version OR current_version>=2147483647
 OR (p_kind IN ('BLOCK_ACCOUNT','PAUSE_STORE') AND previous_at IS NOT NULL)
 OR (p_kind IN ('UNBLOCK_ACCOUNT','RESUME_STORE') AND previous_at IS NULL) THEN
  RAISE EXCEPTION 'Administrative target changed or already has requested state' USING ERRCODE='M1309'; END IF;
 now_at:=clock_timestamp();
 desired_at:=CASE WHEN p_kind IN ('BLOCK_ACCOUNT','PAUSE_STORE') THEN now_at ELSE NULL END;
 INSERT INTO app."AdminAction" (id,"actorProfileId","targetProfileId","targetStoreId",kind,"expectedVersion",version,
  reason,"requestDigest","previousRestrictedAt","restrictedAt","createdAt")
 VALUES (p_operation,p_actor,CASE WHEN p_target_kind='ACCOUNT' THEN p_target_id ELSE NULL END,
  CASE WHEN p_target_kind='STORE' THEN p_target_id ELSE NULL END,p_kind,p_expected_version,current_version+1,
  p_reason,p_digest,previous_at,desired_at,now_at);
 IF p_target_kind='ACCOUNT' THEN
  UPDATE app."Profile" SET "suspendedAt"=desired_at,"securityVersion"=current_version+1 WHERE id=p_target_id;
 ELSE
  UPDATE app."Store" SET "platformPausedAt"=desired_at,"platformVersion"=current_version+1 WHERE id=p_target_id;
 END IF;
 RETURN p_operation;
END;
$fn$;
REVOKE ALL ON FUNCTION app.lock_admin_access(uuid,uuid),app.apply_admin_action(uuid,uuid,uuid,text,uuid,text,integer,text,text),
 app.guard_store_admin_initialization(),app.guard_admin_lock_only(),app.guard_admin_projection(),app.guard_admin_action(),app.validate_admin_action() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.lock_admin_access(uuid,uuid),app.apply_admin_action(uuid,uuid,uuid,text,uuid,text,integer,text,text) TO meumimo_runtime;
-- ALTER OWNER exige SET ROLE e CREATE no schema mesmo para o migrador CREATEROLE.
-- Alterar somente o grant deste migrador, sem retirar seu ADMIN OPTION automático.
DO $body$
DECLARE actor oid; executor oid; before_memberships jsonb; after_memberships jsonb;
 own_membership record; own_existed boolean; temporary_set boolean;
BEGIN
 SELECT oid INTO actor FROM pg_roles WHERE rolname=current_user;
 SELECT oid INTO executor FROM pg_roles WHERE rolname='meumimo_admin_executor';
 SELECT COALESCE(jsonb_agg(to_jsonb(m)-'oid' ORDER BY grantor),'[]'::jsonb) INTO before_memberships
  FROM pg_auth_members m WHERE roleid=executor AND member=actor;
 SELECT admin_option,inherit_option,set_option INTO own_membership FROM pg_auth_members
  WHERE roleid=executor AND member=actor AND grantor=actor;
 own_existed:=FOUND;
 temporary_set:=NOT pg_has_role(current_user,'meumimo_admin_executor','SET');
 IF temporary_set THEN
  GRANT meumimo_admin_executor TO CURRENT_USER WITH SET TRUE GRANTED BY CURRENT_USER;
 END IF;
 GRANT CREATE ON SCHEMA app TO meumimo_admin_executor;
 ALTER FUNCTION app.lock_admin_access(uuid,uuid) OWNER TO meumimo_admin_executor;
 ALTER FUNCTION app.apply_admin_action(uuid,uuid,uuid,text,uuid,text,integer,text,text) OWNER TO meumimo_admin_executor;
 REVOKE CREATE ON SCHEMA app FROM meumimo_admin_executor;
 IF temporary_set THEN
  IF own_existed THEN
   EXECUTE format('GRANT meumimo_admin_executor TO CURRENT_USER WITH INHERIT %s GRANTED BY CURRENT_USER',CASE WHEN own_membership.inherit_option THEN 'TRUE' ELSE 'FALSE' END);
   EXECUTE format('GRANT meumimo_admin_executor TO CURRENT_USER WITH SET %s GRANTED BY CURRENT_USER',CASE WHEN own_membership.set_option THEN 'TRUE' ELSE 'FALSE' END);
   EXECUTE format('GRANT meumimo_admin_executor TO CURRENT_USER WITH ADMIN %s GRANTED BY CURRENT_USER',CASE WHEN own_membership.admin_option THEN 'TRUE' ELSE 'FALSE' END);
  ELSE
   REVOKE meumimo_admin_executor FROM CURRENT_USER GRANTED BY CURRENT_USER;
  END IF;
 END IF;
 SELECT COALESCE(jsonb_agg(to_jsonb(m)-'oid' ORDER BY grantor),'[]'::jsonb) INTO after_memberships
  FROM pg_auth_members m WHERE roleid=executor AND member=actor;
 IF after_memberships IS DISTINCT FROM before_memberships THEN
  RAISE EXCEPTION 'Migration membership restoration failed' USING ERRCODE='23514';
 END IF;
END;
$body$;

-- Evolução aditiva da guarda T09: apenas emissões novas observam a pausa da plataforma.
-- Replay não executa INSERT e a cadeia de débito/estorno permanece intacta.
CREATE OR REPLACE FUNCTION app.validate_redemption_source() RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE reward app."Reward"; store app."Store"; participant app."Membership"; balance numeric;
BEGIN
 SELECT * INTO store FROM app."Store" WHERE id=NEW."storeId" FOR UPDATE;
 SELECT * INTO reward FROM app."Reward" WHERE id=NEW."rewardId" AND "storeId"=NEW."storeId";
 SELECT * INTO participant FROM app."Membership" WHERE id=NEW."participantMembershipId" AND "storeId"=NEW."storeId";
 SELECT COALESCE(sum(amount),0) INTO balance FROM app."PointsEntry"
  WHERE "storeId"=NEW."storeId" AND "participantMembershipId"=NEW."participantMembershipId";
 IF store.id IS NULL OR store.state::text<>'ACTIVE' OR store."platformPausedAt" IS NOT NULL
 OR reward.id IS NULL OR NOT reward.available OR reward."archivedAt" IS NOT NULL
 OR participant.id IS NULL OR participant.role::text<>'PARTICIPANT' OR participant."closedAt" IS NOT NULL
 OR participant."accessRevokedAt" IS NOT NULL OR participant."profileId"<>NEW."authorProfileId"
 OR NOT EXISTS(SELECT 1 FROM app."Profile" p WHERE p.id=NEW."authorProfileId" AND p."suspendedAt" IS NULL)
 OR NEW."balanceBefore"<>balance OR NEW."balanceBefore"<reward.cost
 OR NEW.timezone<>store.timezone OR NEW."localDate"<>to_char(NEW."createdAt" AT TIME ZONE store.timezone,'YYYY-MM-DD')
 OR (NEW."rewardVersion",NEW."rewardName",NEW."rewardDescription",NEW."rewardCategory",NEW."rewardSticker",NEW."rewardCost",NEW."rewardNote",NEW."rewardInstructions")
 IS DISTINCT FROM (reward.version,reward.name,reward.description,reward.category,reward.sticker,reward.cost,reward.note,reward.instructions)
 OR (NEW."stockBefore" IS NULL AND reward.stock IS NOT NULL)
 OR (NEW."stockBefore" IS NOT NULL AND (reward.stock IS DISTINCT FROM NEW."stockAfter" OR reward."stockRevision"<>NEW."stockRevision"
  OR NOT EXISTS (SELECT 1 FROM app."Reward" r WHERE r.id=reward.id AND r.xmin=pg_current_xact_id()::text::xid)
  OR EXISTS (SELECT 1 FROM app."RewardEvent" e WHERE e."rewardId"=reward.id
   AND e.configuration->>'stockRevision'=NEW."stockRevision"::text))) THEN
  RAISE EXCEPTION 'Ticket requires authorized current snapshot, stock and funds' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$fn$;
COMMIT;
