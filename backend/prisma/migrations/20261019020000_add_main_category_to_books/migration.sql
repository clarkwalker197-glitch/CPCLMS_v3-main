ALTER TABLE "books" ADD COLUMN "main_category" VARCHAR(20);
ALTER TABLE "ebooks" ADD COLUMN "main_category" VARCHAR(20);

UPDATE "books" AS b
SET "main_category" = COALESCE(
  substring(c."slug" from '^dewey-([0-9])') || '00',
  substring(b."classification_number" from '^([0-9])') || '00'
)
FROM "categories" AS c
WHERE b."category_id" = c."id"
  AND b."main_category" IS NULL;

UPDATE "books"
SET "main_category" = substring("classification_number" from '^([0-9])') || '00'
WHERE "main_category" IS NULL
  AND "classification_number" ~ '^[0-9]';

UPDATE "ebooks" AS e
SET "main_category" = COALESCE(
  substring(c."slug" from '^dewey-([0-9])') || '00',
  substring(e."classification_number" from '^([0-9])') || '00'
)
FROM "categories" AS c
WHERE e."category_id" = c."id"
  AND e."main_category" IS NULL;

UPDATE "ebooks"
SET "main_category" = substring("classification_number" from '^([0-9])') || '00'
WHERE "main_category" IS NULL
  AND "classification_number" ~ '^[0-9]';
