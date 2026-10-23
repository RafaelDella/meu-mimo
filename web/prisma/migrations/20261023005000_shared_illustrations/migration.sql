-- Ampliar a biblioteca compartilhada sem alterar dados, RLS, grants ou histórico.
-- As demais condições das quatro restrições permanecem as da cadeia aplicada.
BEGIN;

ALTER TABLE "Activity" DROP CONSTRAINT "Activity_fields_check";
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_fields_check" CHECK (
 char_length(name) BETWEEN 1 AND 80 AND name=btrim(name) AND char_length(description)<=1000
 AND char_length(category)<=80 AND sticker IN ('','gift','coffee','takeout','envelope',
 'cinema','dinner','picnic','stars','games','music','relax','flowers','book','dessert',
 'pizza','art','puzzle','camera','map','beauty','cozy','car','jar','clock')
 AND points BETWEEN 1 AND 1000000 AND version>=1 AND "weeklyLimit" BETWEEN 1 AND 100
 AND (frequency='WEEKLY' OR "weeklyLimit"=1)
);

ALTER TABLE "ActivitySubmission" DROP CONSTRAINT "ActivitySubmission_state_check";
ALTER TABLE "ActivitySubmission" ADD CONSTRAINT "ActivitySubmission_state_check" CHECK (
 (status::text='DRAFT' AND "analysisVersion"=0 AND "receivedAt" IS NULL AND "approvedAt" IS NULL AND "requestDigest" IS NULL
 AND "activityVersion" IS NULL AND "activityName" IS NULL AND "activityDescription" IS NULL
 AND "activityCategory" IS NULL AND "activitySticker" IS NULL AND points IS NULL
 AND frequency IS NULL AND "weeklyLimit" IS NULL AND "approvalMode" IS NULL
 AND caption='' AND timezone IS NULL AND "localDate" IS NULL AND "periodKey" IS NULL
 AND "periodStart" IS NULL AND "periodEnd" IS NULL AND "occurrenceNumber" IS NULL AND "evidenceAssetId" IS NULL)
 OR
 (status::text IN ('PENDING','APPROVED','CONTESTED','VOIDED') AND "analysisVersion">=0 AND "receivedAt" IS NOT NULL AND "receivedAt">="createdAt"
 AND "requestDigest" IS NOT NULL AND "requestDigest" ~ '^[a-f0-9]{64}$'
 AND "activityVersion" IS NOT NULL AND "activityVersion">=1
 AND "activityName" IS NOT NULL AND char_length("activityName") BETWEEN 1 AND 80
 AND "activityDescription" IS NOT NULL AND char_length("activityDescription")<=1000
 AND "activityCategory" IS NOT NULL AND char_length("activityCategory")<=80
 AND "activitySticker" IS NOT NULL AND "activitySticker" IN ('','gift','coffee','takeout','envelope',
 'cinema','dinner','picnic','stars','games','music','relax','flowers','book','dessert',
 'pizza','art','puzzle','camera','map','beauty','cozy','car','jar','clock')
 AND points IS NOT NULL AND points BETWEEN 1 AND 1000000
 AND frequency IS NOT NULL AND "weeklyLimit" IS NOT NULL AND "weeklyLimit" BETWEEN 1 AND 100
 AND "approvalMode" IS NOT NULL AND timezone IS NOT NULL AND char_length(timezone) BETWEEN 1 AND 80
 AND "localDate" IS NOT NULL AND "localDate" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
 AND "periodKey" IS NOT NULL AND char_length("periodKey") BETWEEN 1 AND 50
 AND "occurrenceNumber" IS NOT NULL AND "occurrenceNumber" BETWEEN 1 AND 100
 AND char_length(caption)<=500 AND caption=btrim(caption)
 AND ((frequency='ONCE' AND "periodStart" IS NULL AND "periodEnd" IS NULL)
 OR (frequency IN ('DAILY','WEEKLY') AND "periodStart" IS NOT NULL AND "periodEnd" IS NOT NULL
 AND "periodStart"<="receivedAt" AND "receivedAt"<"periodEnd"))
 AND ((status::text<>'APPROVED' AND ("approvedAt" IS NULL OR "approvedAt">="receivedAt"))
 OR (status::text='APPROVED' AND "approvedAt" IS NOT NULL AND "approvedAt">="receivedAt")))
);

ALTER TABLE "Reward" DROP CONSTRAINT "Reward_fields_check";
ALTER TABLE "Reward" ADD CONSTRAINT "Reward_fields_check" CHECK (
 char_length(name) BETWEEN 1 AND 80 AND name=btrim(name) AND char_length(description)<=1000
 AND char_length(category)<=80 AND sticker IN ('gift','coffee','takeout','envelope',
 'cinema','dinner','picnic','stars','games','music','relax','flowers','book','dessert',
 'pizza','art','puzzle','camera','map','beauty','cozy','car','jar','clock')
 AND cost BETWEEN 1 AND 1000000 AND char_length(note)<=500 AND char_length(instructions)<=1000
 AND (stock IS NULL OR stock BETWEEN 0 AND 1000000) AND version>=1 AND "stockRevision">=1
);

ALTER TABLE "Redemption" DROP CONSTRAINT "Redemption_fields_check";
ALTER TABLE "Redemption" ADD CONSTRAINT "Redemption_fields_check" CHECK (
 "requestDigest" ~ '^[a-f0-9]{64}$'
 AND "rewardVersion">=1 AND char_length("rewardName") BETWEEN 1 AND 80
 AND char_length("rewardDescription")<=1000 AND char_length("rewardCategory")<=80
 AND "rewardSticker" IN ('gift','coffee','takeout','envelope',
 'cinema','dinner','picnic','stars','games','music','relax','flowers','book','dessert',
 'pizza','art','puzzle','camera','map','beauty','cozy','car','jar','clock')
 AND "rewardCost" BETWEEN 1 AND 1000000
 AND char_length("rewardNote")<=500 AND char_length("rewardInstructions")<=1000
 AND "balanceBefore">="rewardCost" AND "expectedBalance"="balanceBefore"
 AND "balanceAfter"="balanceBefore"-"rewardCost" AND "localDate" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
 AND char_length(timezone) BETWEEN 1 AND 80 AND code='MIMO-'||upper(id::text)
 AND (("stockBefore" IS NULL AND "stockAfter" IS NULL AND "stockRevision" IS NULL)
 OR ("stockBefore" IS NOT NULL AND "stockAfter" IS NOT NULL AND "stockRevision" IS NOT NULL
 AND "stockBefore" BETWEEN 1 AND 1000000 AND "stockAfter"="stockBefore"-1 AND "stockRevision">=2))
);

COMMIT;
