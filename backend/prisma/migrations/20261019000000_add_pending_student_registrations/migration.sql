CREATE TABLE "pending_student_registrations" (
    "id" TEXT NOT NULL,
    "library_id" VARCHAR(30) NOT NULL,
    "first_name" VARCHAR(100) NOT NULL,
    "last_name" VARCHAR(100) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password" VARCHAR(255) NOT NULL,
    "department" VARCHAR(150) NOT NULL,
    "year_section" VARCHAR(50) NOT NULL,
    "phone" VARCHAR(30),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pending_student_registrations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pending_student_registrations_library_id_key" ON "pending_student_registrations"("library_id");
CREATE UNIQUE INDEX "pending_student_registrations_email_key" ON "pending_student_registrations"("email");
CREATE INDEX "pending_student_registrations_created_at_idx" ON "pending_student_registrations"("created_at");
