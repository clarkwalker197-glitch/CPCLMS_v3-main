ALTER TABLE "borrow_transactions"
ADD COLUMN "fine_waived" BOOLEAN NOT NULL DEFAULT false;

UPDATE "borrow_transactions"
SET "fine_waived" = true
WHERE "status"::text = 'RETURNED'
  AND COALESCE("fine_amount", 0) > 0
  AND "fine_paid" = false;