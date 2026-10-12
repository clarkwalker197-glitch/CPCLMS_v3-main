ALTER TABLE "users"
ADD COLUMN "system_notifications_enabled" BOOLEAN NOT NULL DEFAULT true;

UPDATE "users"
SET "system_notifications_enabled" = "notifications_enabled";
