ALTER TABLE "books"
ADD COLUMN "added_by_name" VARCHAR(255);

UPDATE "books" AS book
SET "added_by_name" = creator."actor_name"
FROM (
  SELECT DISTINCT ON ("entity_id")
    "entity_id",
    NULLIF(BTRIM("actor_name"), '') AS "actor_name"
  FROM "activity_logs"
  WHERE "entity" = 'Book'
    AND "action" = 'ADD_BOOK'
    AND "entity_id" IS NOT NULL
    AND "deleted_at" IS NULL
  ORDER BY "entity_id", "created_at" ASC
) AS creator
WHERE book."id" = creator."entity_id"
  AND creator."actor_name" IS NOT NULL;
