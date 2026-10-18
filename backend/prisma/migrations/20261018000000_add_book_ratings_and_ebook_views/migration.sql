CREATE TABLE "book_ratings" (
    "id" TEXT NOT NULL,
    "book_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "book_ratings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "book_ratings_rating_check" CHECK ("rating" BETWEEN 1 AND 5)
);

CREATE TABLE "ebook_ratings" (
    "id" TEXT NOT NULL,
    "ebook_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ebook_ratings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ebook_ratings_rating_check" CHECK ("rating" BETWEEN 1 AND 5)
);

CREATE TABLE "ebook_views" (
    "id" TEXT NOT NULL,
    "ebook_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "viewed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ebook_views_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "book_ratings_book_id_user_id_key" ON "book_ratings"("book_id", "user_id");
CREATE INDEX "book_ratings_book_id_idx" ON "book_ratings"("book_id");
CREATE UNIQUE INDEX "ebook_ratings_ebook_id_user_id_key" ON "ebook_ratings"("ebook_id", "user_id");
CREATE INDEX "ebook_ratings_ebook_id_idx" ON "ebook_ratings"("ebook_id");
CREATE INDEX "ebook_views_ebook_id_viewed_at_idx" ON "ebook_views"("ebook_id", "viewed_at");
CREATE INDEX "ebook_views_ebook_id_user_id_idx" ON "ebook_views"("ebook_id", "user_id");
CREATE INDEX "ebook_views_user_id_idx" ON "ebook_views"("user_id");

ALTER TABLE "book_ratings" ADD CONSTRAINT "book_ratings_book_id_fkey"
    FOREIGN KEY ("book_id") REFERENCES "books"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "book_ratings" ADD CONSTRAINT "book_ratings_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ebook_ratings" ADD CONSTRAINT "ebook_ratings_ebook_id_fkey"
    FOREIGN KEY ("ebook_id") REFERENCES "ebooks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ebook_ratings" ADD CONSTRAINT "ebook_ratings_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ebook_views" ADD CONSTRAINT "ebook_views_ebook_id_fkey"
    FOREIGN KEY ("ebook_id") REFERENCES "ebooks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ebook_views" ADD CONSTRAINT "ebook_views_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
