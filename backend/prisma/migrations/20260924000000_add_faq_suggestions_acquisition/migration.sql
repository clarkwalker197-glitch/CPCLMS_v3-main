CREATE TABLE "faqs" (
    "id" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "category" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_published" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "faqs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "suggestions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "admin_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "suggestions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "acquisition_requests" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "author" TEXT,
    "isbn" TEXT,
    "details" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "admin_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "acquisition_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "faqs_is_published_sort_order_idx" ON "faqs"("is_published", "sort_order");
CREATE INDEX "suggestions_user_id_idx" ON "suggestions"("user_id");
CREATE INDEX "suggestions_status_idx" ON "suggestions"("status");
CREATE INDEX "acquisition_requests_user_id_idx" ON "acquisition_requests"("user_id");
CREATE INDEX "acquisition_requests_status_idx" ON "acquisition_requests"("status");

ALTER TABLE "faqs" ADD CONSTRAINT "faqs_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "suggestions" ADD CONSTRAINT "suggestions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "acquisition_requests" ADD CONSTRAINT "acquisition_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "faqs" ("id", "question", "answer", "category", "sort_order", "is_published", "updated_at") VALUES
('faq_default_borrow_period', 'How long can I borrow a book?', 'Students may borrow books for the period configured by the library. Faculty borrowing periods may differ according to library policy.', 'Borrowing', 1, true, CURRENT_TIMESTAMP),
('faq_default_fines', 'How are overdue fines calculated?', 'Overdue fines are charged at ₱5 per overdue day unless the librarian has configured a different policy.', 'Fines', 2, true, CURRENT_TIMESTAMP),
('faq_default_qr', 'How do I approve or return a book with QR?', 'Open your approved request or transaction QR code and present it to the librarian for scanning.', 'Borrowing', 3, true, CURRENT_TIMESTAMP),
('faq_default_hours', 'What are the library hours?', 'Please check the latest library announcement or contact the library desk for current operating hours.', 'Hours', 4, true, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;