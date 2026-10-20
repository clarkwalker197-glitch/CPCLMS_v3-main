CREATE TABLE "web_push_config" (
    "id" VARCHAR(32) NOT NULL DEFAULT 'default',
    "public_key" VARCHAR(255) NOT NULL,
    "private_key" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "web_push_config_pkey" PRIMARY KEY ("id")
);
