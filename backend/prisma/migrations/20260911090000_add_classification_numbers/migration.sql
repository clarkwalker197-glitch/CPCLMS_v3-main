ALTER TABLE "books" ADD COLUMN "classification_number" TEXT;
ALTER TABLE "ebooks" ADD COLUMN "classification_number" TEXT;

INSERT INTO "categories" ("id", "name", "slug", "description", "created_at", "updated_at")
VALUES
  ('fixed-generalities', 'Generalities', 'generalities', 'Dewey classification 001-099', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('fixed-philosophy', 'Philosophy', 'philosophy', 'Dewey classification 100-199', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('fixed-religion', 'Religion', 'religion', 'Dewey classification 200-299', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('fixed-filipiniana', 'Filipiniana', 'filipiniana', 'Filipiniana collection', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('fixed-social-science', 'Social Science', 'social-science', 'Dewey classification 300-399', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('fixed-languages', 'Languages', 'languages', 'Dewey classification 400-499', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('fixed-natural-science', 'Natural Science', 'natural-science', 'Dewey classification 500-599', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('fixed-applied-science', 'Applied Science', 'applied-science', 'Dewey classification 600-699', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('fixed-arts-and-recreation', 'Arts and Recreation', 'arts-and-recreation', 'Dewey classification 700-799', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('fixed-literature', 'Literature', 'literature', 'Dewey classification 800-899', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('fixed-geography-and-history', 'Geography and History', 'geography-and-history', 'Dewey classification 900-999', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('fixed-biology-and-collective-biography', 'Biology and Collective Biography', 'biology-and-collective-biography', 'Special collection', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;
