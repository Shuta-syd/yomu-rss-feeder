-- Yomu v1 initial schema (手書き: drizzle-kit generate と等価なスキーマを定義)

CREATE TABLE `app_config` (
  `key` text PRIMARY KEY NOT NULL,
  `value` text NOT NULL
);
--> statement-breakpoint

CREATE TABLE `feeds` (
  `id` text PRIMARY KEY NOT NULL,
  `title` text NOT NULL,
  `url` text NOT NULL,
  `site_url` text,
  `description` text,
  `favicon_url` text,
  `category` text DEFAULT '未分類' NOT NULL,
  `fetch_interval_min` integer DEFAULT 30 NOT NULL,
  `last_fetched_at` integer,
  `last_fetch_status` text DEFAULT 'pending' NOT NULL,
  `last_fetch_error` text,
  `consecutive_fetch_failures` integer DEFAULT 0 NOT NULL,
  `created_at` integer NOT NULL
);
--> statement-breakpoint

CREATE UNIQUE INDEX `feeds_url_unique` ON `feeds` (`url`);
--> statement-breakpoint
CREATE INDEX `idx_feeds_category` ON `feeds` (`category`);
--> statement-breakpoint

CREATE TABLE `articles` (
  `id` text PRIMARY KEY NOT NULL,
  `feed_id` text NOT NULL,
  `title` text NOT NULL,
  `url` text NOT NULL,
  `author` text,
  `content_html` text,
  `content_plain` text,
  `published_at` integer,
  `sort_key` integer NOT NULL,
  `detected_language` text,
  `dedup_hash` text NOT NULL,
  `is_read` integer DEFAULT 0 NOT NULL,
  `is_starred` integer DEFAULT 0 NOT NULL,
  `read_at` integer,
  `ai_summary_short` text,
  `ai_tags` text,
  `ai_stage1_status` text DEFAULT 'pending' NOT NULL,
  `ai_stage1_error` text,
  `ai_stage1_processed_at` integer,
  `ai_summary_full` text,
  `ai_translation` text,
  `ai_key_points` text,
  `ai_stage2_status` text DEFAULT 'none' NOT NULL,
  `ai_stage2_error` text,
  `ai_stage2_processed_at` integer,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`feed_id`) REFERENCES `feeds`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint

CREATE UNIQUE INDEX `idx_articles_dedup` ON `articles` (`feed_id`, `dedup_hash`);
--> statement-breakpoint
CREATE INDEX `idx_articles_sort` ON `articles` (`sort_key`, `id`);
--> statement-breakpoint
CREATE INDEX `idx_articles_feed_sort` ON `articles` (`feed_id`, `sort_key`, `id`);
--> statement-breakpoint
CREATE INDEX `idx_articles_is_read` ON `articles` (`is_read`);
--> statement-breakpoint
CREATE INDEX `idx_articles_is_starred` ON `articles` (`is_starred`);
