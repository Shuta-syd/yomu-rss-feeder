-- schema.ts と既存migrationの差分を解消する catch-up migration

ALTER TABLE `articles` ADD COLUMN `ai_title_ja` text;
--> statement-breakpoint
ALTER TABLE `articles` ADD COLUMN `ai_related_links` text;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `x_likes` (
  `id` text PRIMARY KEY NOT NULL,
  `author_name` text NOT NULL,
  `author_username` text NOT NULL,
  `author_profile_image_url` text,
  `text` text NOT NULL,
  `liked_at` integer NOT NULL,
  `tweet_created_at` integer,
  `urls` text,
  `media_urls` text,
  `reply_count` integer,
  `retweet_count` integer,
  `like_count` integer,
  `created_at` integer NOT NULL
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS `idx_x_likes_liked_at` ON `x_likes` (`liked_at`);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `x_analyses` (
  `id` text PRIMARY KEY NOT NULL,
  `period_start` integer NOT NULL,
  `period_end` integer NOT NULL,
  `like_count` integer NOT NULL,
  `summary_json` text NOT NULL,
  `created_at` integer NOT NULL
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `push_subscriptions` (
  `id` text PRIMARY KEY NOT NULL,
  `endpoint` text NOT NULL,
  `keys_p256dh` text NOT NULL,
  `keys_auth` text NOT NULL,
  `created_at` integer NOT NULL
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS `push_subscriptions_endpoint_unique` ON `push_subscriptions` (`endpoint`);
