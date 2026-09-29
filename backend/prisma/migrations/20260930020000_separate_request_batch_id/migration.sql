ALTER TABLE "borrow_requests"
ADD COLUMN "request_batch_id" TEXT;

UPDATE "borrow_requests"
SET "request_batch_id" = COALESCE("transaction_id", "id")
WHERE "request_batch_id" IS NULL;

CREATE INDEX "borrow_requests_request_batch_id_idx"
ON "borrow_requests"("request_batch_id");