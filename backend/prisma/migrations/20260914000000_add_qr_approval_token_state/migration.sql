ALTER TABLE "borrow_requests"
  ADD COLUMN "approval_token_hash" TEXT,
  ADD COLUMN "approval_token_expires_at" TIMESTAMP(3),
  ADD COLUMN "approval_token_used_at" TIMESTAMP(3),
  ADD COLUMN "approval_token_issued_by_id" TEXT;

CREATE INDEX "borrow_requests_approval_token_hash_idx"
  ON "borrow_requests"("approval_token_hash");
