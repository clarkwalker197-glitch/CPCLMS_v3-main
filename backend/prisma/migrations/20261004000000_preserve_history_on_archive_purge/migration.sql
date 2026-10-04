ALTER TABLE "borrow_requests"
  DROP CONSTRAINT IF EXISTS "borrow_requests_user_id_fkey",
  DROP CONSTRAINT IF EXISTS "borrow_requests_book_id_fkey",
  ALTER COLUMN "user_id" DROP NOT NULL,
  ALTER COLUMN "book_id" DROP NOT NULL,
  ADD CONSTRAINT "borrow_requests_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "borrow_requests_book_id_fkey"
    FOREIGN KEY ("book_id") REFERENCES "books"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "borrow_transactions"
  DROP CONSTRAINT IF EXISTS "borrow_transactions_user_id_fkey",
  DROP CONSTRAINT IF EXISTS "borrow_transactions_book_id_fkey",
  ALTER COLUMN "user_id" DROP NOT NULL,
  ALTER COLUMN "book_id" DROP NOT NULL,
  ADD CONSTRAINT "borrow_transactions_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "borrow_transactions_book_id_fkey"
    FOREIGN KEY ("book_id") REFERENCES "books"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "reservations"
  DROP CONSTRAINT IF EXISTS "reservations_user_id_fkey",
  DROP CONSTRAINT IF EXISTS "reservations_book_id_fkey",
  ALTER COLUMN "user_id" DROP NOT NULL,
  ALTER COLUMN "book_id" DROP NOT NULL,
  ADD CONSTRAINT "reservations_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "reservations_book_id_fkey"
    FOREIGN KEY ("book_id") REFERENCES "books"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "notifications"
  DROP CONSTRAINT IF EXISTS "notifications_user_id_fkey",
  ALTER COLUMN "user_id" DROP NOT NULL,
  ADD CONSTRAINT "notifications_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "suggestions"
  DROP CONSTRAINT IF EXISTS "suggestions_user_id_fkey",
  ALTER COLUMN "user_id" DROP NOT NULL,
  ADD CONSTRAINT "suggestions_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "acquisition_requests"
  DROP CONSTRAINT IF EXISTS "acquisition_requests_user_id_fkey",
  ALTER COLUMN "user_id" DROP NOT NULL,
  ADD CONSTRAINT "acquisition_requests_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
