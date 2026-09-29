UPDATE "borrow_requests"
SET "request_batch_id" = COALESCE("request_batch_id", "transaction_id", "id")
WHERE "request_batch_id" IS NULL;

UPDATE "borrow_requests"
SET "transaction_id" = NULL
WHERE "status"::text = 'PENDING';