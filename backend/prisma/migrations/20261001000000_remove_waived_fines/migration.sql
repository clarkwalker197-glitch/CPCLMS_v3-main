UPDATE "borrow_transactions"
SET "fine_paid" = true
WHERE "fine_waived" = true
  AND COALESCE("fine_amount", 0) > 0;

ALTER TABLE "borrow_transactions"
DROP COLUMN "fine_waived";