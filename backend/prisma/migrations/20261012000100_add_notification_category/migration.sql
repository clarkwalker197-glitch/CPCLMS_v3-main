ALTER TABLE "notifications"
ADD COLUMN "is_system" BOOLEAN NOT NULL DEFAULT false;

UPDATE "notifications"
SET "is_system" = true
WHERE "type" = 'FAQ_PUBLISHED';
