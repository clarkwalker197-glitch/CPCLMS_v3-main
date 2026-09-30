ALTER TYPE "RequestStatus" RENAME TO "RequestStatus_old";

CREATE TYPE "RequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

ALTER TABLE "borrow_requests" ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "borrow_requests"
  ALTER COLUMN "status" TYPE "RequestStatus"
  USING (
    CASE
      WHEN "status"::text = 'AWAITING_PICKUP' THEN 'PENDING'
      ELSE "status"::text
    END
  )::"RequestStatus";

ALTER TABLE "borrow_requests" ALTER COLUMN "status" SET DEFAULT 'PENDING'::"RequestStatus";

DROP TYPE "RequestStatus_old";