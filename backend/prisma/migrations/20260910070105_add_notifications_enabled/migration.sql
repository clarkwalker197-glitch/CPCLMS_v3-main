-- Restore the notification preference column after the database restore.
ALTER TABLE "users"
ADD COLUMN IF NOT EXISTS "notifications_enabled" BOOLEAN NOT NULL DEFAULT true;
