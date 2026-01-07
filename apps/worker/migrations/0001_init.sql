-- Better Auth core schema
CREATE TABLE IF NOT EXISTS "user" (
	"id" TEXT NOT NULL PRIMARY KEY,
	"name" TEXT NOT NULL,
	"email" TEXT NOT NULL UNIQUE,
	"emailVerified" INTEGER NOT NULL DEFAULT 0,
	"image" TEXT,
	"createdAt" TEXT NOT NULL,
	"updatedAt" TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS "session" (
	"id" TEXT NOT NULL PRIMARY KEY,
	"userId" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
	"token" TEXT NOT NULL UNIQUE,
	"expiresAt" TEXT NOT NULL,
	"ipAddress" TEXT,
	"userAgent" TEXT,
	"createdAt" TEXT NOT NULL,
	"updatedAt" TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS "account" (
	"id" TEXT NOT NULL PRIMARY KEY,
	"userId" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
	"accountId" TEXT NOT NULL,
	"providerId" TEXT NOT NULL,
	"accessToken" TEXT,
	"refreshToken" TEXT,
	"idToken" TEXT,
	"accessTokenExpiresAt" TEXT,
	"refreshTokenExpiresAt" TEXT,
	"scope" TEXT,
	"password" TEXT,
	"createdAt" TEXT NOT NULL,
	"updatedAt" TEXT NOT NULL,
	UNIQUE ("providerId", "accountId")
);

CREATE TABLE IF NOT EXISTS "verification" (
	"id" TEXT NOT NULL PRIMARY KEY,
	"identifier" TEXT NOT NULL,
	"value" TEXT NOT NULL,
	"expiresAt" TEXT NOT NULL,
	"createdAt" TEXT NOT NULL,
	"updatedAt" TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_session_user" ON "session" ("userId");
CREATE INDEX IF NOT EXISTS "idx_account_user" ON "account" ("userId");
CREATE INDEX IF NOT EXISTS "idx_verification_identifier" ON "verification" ("identifier");

-- App schema
CREATE TABLE IF NOT EXISTS "users" (
	"id" TEXT NOT NULL PRIMARY KEY,
	"email" TEXT NOT NULL,
	"name" TEXT NOT NULL,
	"image" TEXT,
	"primary_currency" TEXT,
	"timezone" TEXT,
	"push_enabled" INTEGER NOT NULL DEFAULT 0,
	"onboarding_done" INTEGER NOT NULL DEFAULT 0,
	"created_at" TEXT NOT NULL,
	"updated_at" TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS "categories" (
	"id" TEXT NOT NULL PRIMARY KEY,
	"owner_email" TEXT NOT NULL,
	"name" TEXT NOT NULL,
	"color" TEXT,
	"is_default" INTEGER NOT NULL DEFAULT 0,
	"created_at" TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS "subscriptions" (
	"id" TEXT NOT NULL PRIMARY KEY,
	"owner_email" TEXT NOT NULL,
	"name" TEXT NOT NULL,
	"merchant" TEXT,
	"amount_cents" INTEGER NOT NULL,
	"currency" TEXT NOT NULL,
	"cadence_unit" TEXT NOT NULL,
	"cadence_count" INTEGER NOT NULL,
	"next_renewal_at" TEXT NOT NULL,
	"status" TEXT NOT NULL,
	"category_id" TEXT,
	"notes" TEXT,
	"created_at" TEXT NOT NULL,
	"updated_at" TEXT NOT NULL,
	"rate_at_creation" REAL
);

CREATE TABLE IF NOT EXISTS "subscription_events" (
	"id" TEXT NOT NULL PRIMARY KEY,
	"subscription_id" TEXT NOT NULL,
	"owner_email" TEXT NOT NULL,
	"type" TEXT NOT NULL,
	"occurred_at" TEXT NOT NULL,
	"amount_cents" INTEGER NOT NULL,
	"currency" TEXT NOT NULL,
	"rate_at_event" REAL,
	"note" TEXT
);

CREATE TABLE IF NOT EXISTS "push_subscriptions" (
	"id" TEXT NOT NULL PRIMARY KEY,
	"user_id" TEXT NOT NULL,
	"endpoint" TEXT NOT NULL,
	"p256dh" TEXT NOT NULL,
	"auth" TEXT NOT NULL,
	"created_at" TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS "notification_snoozes" (
	"id" TEXT NOT NULL PRIMARY KEY,
	"subscription_id" TEXT NOT NULL,
	"user_id" TEXT NOT NULL,
	"snoozed_until" TEXT NOT NULL,
	"created_at" TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS "fx_rates" (
	"id" TEXT NOT NULL PRIMARY KEY,
	"base" TEXT NOT NULL,
	"target" TEXT NOT NULL,
	"rate" REAL NOT NULL,
	"fetched_at" TEXT NOT NULL,
	"is_stale" INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS "idx_users_email" ON "users" ("email");
CREATE INDEX IF NOT EXISTS "idx_categories_owner_name" ON "categories" ("owner_email", "name");
CREATE INDEX IF NOT EXISTS "idx_subscriptions_owner_status_next" ON "subscriptions" ("owner_email", "status", "next_renewal_at");
CREATE INDEX IF NOT EXISTS "idx_subscription_events_sub" ON "subscription_events" ("subscription_id", "occurred_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_fx_rates_base_target_fetched" ON "fx_rates" ("base", "target", "fetched_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_push_subscriptions_user" ON "push_subscriptions" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_snoozes_subscription_user" ON "notification_snoozes" ("subscription_id", "user_id");
