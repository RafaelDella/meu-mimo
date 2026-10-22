BEGIN;
SET LOCAL search_path TO app;

-- CreateEnum
CREATE TYPE "ConversationSubject" AS ENUM ('SUBMISSION', 'TICKET');

-- CreateEnum
CREATE TYPE "NotificationKind" AS ENUM ('INVITATION_ACCEPTED', 'COMMENT_CREATED');

-- CreateTable
CREATE TABLE "Conversation" (
    "id" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "participantMembershipId" UUID NOT NULL,
    "subjectType" "ConversationSubject" NOT NULL,
    "subjectId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "commentsClosedAt" TIMESTAMPTZ(6),

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Comment" (
    "id" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "authorProfileId" UUID NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboxEvent" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "kind" "NotificationKind" NOT NULL,
    "storeId" UUID NOT NULL,
    "participantMembershipId" UUID NOT NULL,
    "actorProfileId" UUID NOT NULL,
    "recipientMembershipId" UUID NOT NULL,
    "invitationId" UUID,
    "commentId" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "availableAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMPTZ(6),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastErrorCode" TEXT,

    CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMPTZ(6),

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Conversation_storeId_participantMembershipId_idx" ON "Conversation"("storeId", "participantMembershipId");

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_subjectType_subjectId_key" ON "Conversation"("subjectType", "subjectId");

-- CreateIndex
CREATE INDEX "Comment_conversationId_createdAt_id_idx" ON "Comment"("conversationId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "OutboxEvent_key_key" ON "OutboxEvent"("key");

-- CreateIndex
CREATE INDEX "OutboxEvent_processedAt_availableAt_id_idx" ON "OutboxEvent"("processedAt", "availableAt", "id");

-- CreateIndex
CREATE INDEX "OutboxEvent_recipientMembershipId_createdAt_id_idx" ON "OutboxEvent"("recipientMembershipId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_eventId_key" ON "Notification"("eventId");

-- CreateIndex
CREATE INDEX "Notification_createdAt_id_idx" ON "Notification"("createdAt", "id");

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_participantMembershipId_fkey" FOREIGN KEY ("participantMembershipId") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_authorProfileId_fkey" FOREIGN KEY ("authorProfileId") REFERENCES "Profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboxEvent" ADD CONSTRAINT "OutboxEvent_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboxEvent" ADD CONSTRAINT "OutboxEvent_participantMembershipId_fkey" FOREIGN KEY ("participantMembershipId") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboxEvent" ADD CONSTRAINT "OutboxEvent_actorProfileId_fkey" FOREIGN KEY ("actorProfileId") REFERENCES "Profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboxEvent" ADD CONSTRAINT "OutboxEvent_recipientMembershipId_fkey" FOREIGN KEY ("recipientMembershipId") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboxEvent" ADD CONSTRAINT "OutboxEvent_invitationId_fkey" FOREIGN KEY ("invitationId") REFERENCES "Invitation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboxEvent" ADD CONSTRAINT "OutboxEvent_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "Comment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "OutboxEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "Membership_id_storeId_key" ON "Membership" (id, "storeId");
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_membership_store_fkey"
  FOREIGN KEY ("participantMembershipId", "storeId") REFERENCES "Membership" (id, "storeId") ON DELETE RESTRICT;
ALTER TABLE "OutboxEvent" ADD CONSTRAINT "OutboxEvent_participant_store_fkey"
  FOREIGN KEY ("participantMembershipId", "storeId") REFERENCES "Membership" (id, "storeId") ON DELETE RESTRICT;
ALTER TABLE "OutboxEvent" ADD CONSTRAINT "OutboxEvent_recipient_store_fkey"
  FOREIGN KEY ("recipientMembershipId", "storeId") REFERENCES "Membership" (id, "storeId") ON DELETE RESTRICT;
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_text_limit" CHECK
  (char_length(text) BETWEEN 1 AND 500 AND text = btrim(text));
ALTER TABLE "OutboxEvent" ADD CONSTRAINT "OutboxEvent_typed_source" CHECK
  ((kind = 'INVITATION_ACCEPTED' AND "invitationId" IS NOT NULL AND "commentId" IS NULL) OR
   (kind = 'COMMENT_CREATED' AND "commentId" IS NOT NULL AND "invitationId" IS NULL));
ALTER TABLE "OutboxEvent" ADD CONSTRAINT "OutboxEvent_delivery_state" CHECK
  (attempts >= 0 AND char_length(key) BETWEEN 1 AND 100 AND
   ("lastErrorCode" IS NULL OR "lastErrorCode" = 'delivery_failed'));

REVOKE ALL ON app."Conversation", app."Comment", app."OutboxEvent", app."Notification" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON app."Conversation", app."Comment", app."OutboxEvent", app."Notification" TO meumimo_runtime;
GRANT UPDATE ("commentsClosedAt") ON app."Conversation" TO meumimo_runtime;
GRANT UPDATE ("processedAt", "availableAt", attempts, "lastErrorCode") ON app."OutboxEvent" TO meumimo_runtime;
GRANT UPDATE ("readAt") ON app."Notification" TO meumimo_runtime;
ALTER TABLE app."Conversation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE app."Comment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE app."OutboxEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE app."Notification" ENABLE ROW LEVEL SECURITY;
CREATE POLICY runtime_access ON app."Conversation" TO meumimo_runtime USING (true) WITH CHECK (true);
CREATE POLICY runtime_access ON app."Comment" TO meumimo_runtime USING (true) WITH CHECK (true);
CREATE POLICY runtime_access ON app."OutboxEvent" TO meumimo_runtime USING (true) WITH CHECK (true);
CREATE POLICY runtime_access ON app."Notification" TO meumimo_runtime USING (true) WITH CHECK (true);
COMMIT;
