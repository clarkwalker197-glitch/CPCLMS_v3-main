ALTER TABLE "users" ADD COLUMN "last_login_at" TIMESTAMP(3);

UPDATE "users" AS u
SET "last_login_at" = COALESCE(
    (
        SELECT MAX("created_at")
        FROM "activity_logs"
        WHERE "user_id" = u."id" AND "action" = 'LOGIN'
    ),
    u."created_at"
);
