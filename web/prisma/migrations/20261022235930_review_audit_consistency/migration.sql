BEGIN;
SET LOCAL search_path=app;
-- Vincular também evento→origem e estado→crédito no commit.
CREATE OR REPLACE FUNCTION app.validate_review_ledger() RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE total numeric; entries integer; request app."SubmissionReviewEvent"; source app."ActivitySubmission"; funded numeric;
BEGIN
 SELECT * INTO source FROM app."ActivitySubmission" WHERE id=NEW."submissionId";
 IF source.id IS NULL OR source."storeId"<>NEW."storeId" OR source."analysisVersion"<>NEW.version OR source.status<>NEW."toStatus" THEN
  RAISE EXCEPTION 'Review requires corresponding source update' USING ERRCODE='23514';
 END IF;
 SELECT COALESCE(sum(amount),0) INTO funded FROM app."PointsEntry" WHERE "submissionId"=NEW."submissionId";
 IF (source.status::text='APPROVED' AND funded<>source.points)
  OR (source.status::text IN ('VOIDED','PENDING') AND funded<>0)
  OR (source.status::text='CONTESTED' AND funded NOT IN (0,source.points)) THEN
  RAISE EXCEPTION 'Source state requires consistent funding' USING ERRCODE='23514';
 END IF;
 SELECT COALESCE(sum(amount),0),count(*) INTO total,entries FROM app."PointsEntry" WHERE "reviewEventId"=NEW.id;
 IF total<>NEW.delta OR entries<>(CASE WHEN NEW.delta=0 THEN 0 ELSE 1 END) THEN
  RAISE EXCEPTION 'Review delta requires exact ledger' USING ERRCODE='23514';
 END IF;
 IF NEW.action='RESPOND' THEN
  SELECT * INTO request FROM app."SubmissionReviewEvent" WHERE id=NEW."requestId";
  IF request.action IS DISTINCT FROM 'CONTEST' OR request."evidenceRevision" IS DISTINCT FROM NEW."evidenceRevision"
   OR request.version>=NEW.version THEN
   RAISE EXCEPTION 'Response requires prior request' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NULL;
END;
$fn$;
COMMIT;
