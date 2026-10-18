ALTER TABLE "suggestions"
ADD COLUMN "rating" INTEGER,
ADD CONSTRAINT "suggestions_rating_check" CHECK ("rating" IS NULL OR "rating" BETWEEN 1 AND 5);
