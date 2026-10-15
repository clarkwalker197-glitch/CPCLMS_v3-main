CREATE TABLE "idempotency_records" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "key" VARCHAR(64) NOT NULL,
    "operation" VARCHAR(50) NOT NULL,
    "request_hash" VARCHAR(64) NOT NULL,
    "resource_id" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "idempotency_records_user_id_key_key"
    ON "idempotency_records"("user_id", "key");
CREATE INDEX "idempotency_records_created_at_idx"
    ON "idempotency_records"("created_at");

ALTER TABLE "idempotency_records"
    ADD CONSTRAINT "idempotency_records_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
