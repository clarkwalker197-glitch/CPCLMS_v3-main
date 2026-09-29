ALTER TABLE "borrow_requests"
ADD COLUMN "transaction_id" TEXT;

CREATE INDEX "borrow_requests_transaction_id_idx"
ON "borrow_requests"("transaction_id");

ALTER TABLE "borrow_transactions"
ADD COLUMN "transaction_id" TEXT;

CREATE INDEX "borrow_transactions_transaction_id_idx"
ON "borrow_transactions"("transaction_id");