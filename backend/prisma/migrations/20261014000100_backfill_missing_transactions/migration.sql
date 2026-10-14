UPDATE "borrow_transactions" AS bt
SET "status" = 'MISSING',
    "fine_paid" = CASE
      WHEN EXISTS (
        SELECT 1
        FROM "activity_logs" AS payment
        JOIN "activity_logs" AS declaration
          ON declaration."entity_id" = bt."id"
          AND declaration."entity" = 'BorrowTransaction'
          AND declaration."action" = 'DECLARE_MISSING'
        WHERE payment."entity_id" = bt."id"
          AND payment."entity" = 'BorrowTransaction'
          AND payment."action" = 'PAY_FINE'
          AND payment."created_at" >= declaration."created_at"
      ) THEN bt."fine_paid"
      ELSE false
    END
WHERE EXISTS (
  SELECT 1
  FROM "activity_logs" AS missing
  WHERE missing."entity_id" = bt."id"
    AND missing."entity" = 'BorrowTransaction'
    AND missing."action" = 'DECLARE_MISSING'
);
