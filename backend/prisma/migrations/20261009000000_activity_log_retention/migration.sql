ALTER TABLE "activity_logs"
  ADD COLUMN "actor_name" VARCHAR(255),
  ADD COLUMN "description" VARCHAR(500),
  ADD COLUMN "deleted_at" TIMESTAMP(3);

UPDATE "activity_logs" AS log
SET
  "actor_name" = CASE
    WHEN log."user_id" IS NULL THEN 'System'
    ELSE COALESCE(
      (
        SELECT NULLIF(BTRIM(CONCAT_WS(' ', users."first_name", users."last_name")), '')
        FROM "users" AS users
        WHERE users."id" = log."user_id"
      ),
      'Unknown user'
    )
  END,
  "description" = INITCAP(REPLACE(log."action", '_', ' ')) || ' · ' || log."entity";

ALTER TABLE "activity_logs"
  ALTER COLUMN "actor_name" SET NOT NULL,
  ALTER COLUMN "actor_name" SET DEFAULT 'System',
  ALTER COLUMN "description" SET NOT NULL,
  ALTER COLUMN "description" SET DEFAULT 'Activity recorded';

CREATE INDEX "activity_logs_deleted_at_idx" ON "activity_logs"("deleted_at");

CREATE OR REPLACE FUNCTION set_activity_log_audit_fields()
RETURNS TRIGGER AS $$
DECLARE
  resolved_actor_name TEXT;
  target_description TEXT;
BEGIN
  IF NEW."user_id" IS NOT NULL THEN
    SELECT NULLIF(BTRIM(CONCAT_WS(' ', "first_name", "last_name")), '')
    INTO resolved_actor_name
    FROM "users"
    WHERE "id" = NEW."user_id";
  END IF;

  NEW."actor_name" := COALESCE(
    NULLIF(NULLIF(BTRIM(NEW."actor_name"), ''), 'System'),
    resolved_actor_name,
    NULLIF(BTRIM(NEW."details"->>'performedByName'), ''),
    CASE WHEN NEW."user_id" IS NULL THEN 'System' ELSE 'Unknown user' END
  );

  target_description := COALESCE(
    NULLIF(BTRIM(NEW."details"->>'bookTitle'), ''),
    NULLIF(BTRIM(NEW."details"->>'borrowerName'), ''),
    NULLIF(BTRIM(NEW."details"->>'memberName'), ''),
    NULLIF(BTRIM(NEW."details"->>'bookTitles'), ''),
    NULLIF(BTRIM(NEW."details"->>'createdUserName'), ''),
    NULLIF(BTRIM(NEW."details"->>'deletedUserName'), '')
  );
  NEW."description" := LEFT(COALESCE(
    NULLIF(NULLIF(BTRIM(NEW."description"), ''), 'Activity recorded'),
    INITCAP(REPLACE(NEW."action", '_', ' ')) ||
      CASE WHEN target_description IS NULL THEN '' ELSE ': ' || target_description END
  ), 500);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "activity_logs_audit_fields_before_insert"
BEFORE INSERT ON "activity_logs"
FOR EACH ROW
EXECUTE FUNCTION set_activity_log_audit_fields();
