CREATE TABLE `saved_sites` (
  `id` text PRIMARY KEY NOT NULL,
  `title` text NOT NULL,
  `url` text NOT NULL,
  `category` text NOT NULL DEFAULT '未分類',
  `favicon_url` text,
  `created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_saved_sites_url` ON `saved_sites` (`url`);
--> statement-breakpoint
CREATE INDEX `idx_saved_sites_category` ON `saved_sites` (`category`);
