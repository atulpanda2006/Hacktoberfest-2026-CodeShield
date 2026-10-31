-- CreateTable
CREATE TABLE "github_accounts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "github_user_id" TEXT NOT NULL,
    "github_username" VARCHAR(50) NOT NULL,
    "encrypted_access_token" TEXT NOT NULL,
    "token_type" VARCHAR(50) NOT NULL,
    "scopes" TEXT,
    "connected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "expires_at" TIMESTAMP(3),

    CONSTRAINT "github_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "github_accounts_github_username_key" ON "github_accounts"("github_username");
