-- One GitHub connection per DTN user.
CREATE UNIQUE INDEX "github_accounts_user_id_key" ON "github_accounts"("user_id");
