ALTER TABLE "password_reset_tokens"
ADD COLUMN "sent_at" TIMESTAMP(3);

UPDATE "password_reset_tokens"
SET "sent_at" = "created_at";
