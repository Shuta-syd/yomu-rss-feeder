import { sqliteTable, text, integer, uniqueIndex, index, real } from "drizzle-orm/sqlite-core";

export const appConfig = sqliteTable("app_config", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export const feeds = sqliteTable(
  "feeds",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    url: text("url").notNull().unique(),
    siteUrl: text("site_url"),
    description: text("description"),
    faviconUrl: text("favicon_url"),
    category: text("category").notNull().default("未分類"),
    fetchIntervalMin: integer("fetch_interval_min").notNull().default(30),
    lastFetchedAt: integer("last_fetched_at"),
    lastFetchStatus: text("last_fetch_status").notNull().default("pending"),
    lastFetchError: text("last_fetch_error"),
    consecutiveFetchFailures: integer("consecutive_fetch_failures").notNull().default(0),
    aiEnabled: integer("ai_enabled", { mode: "boolean" }).notNull().default(true),
    summaryLens: text("summary_lens"),
    createdAt: integer("created_at")
      .notNull()
      .$defaultFn(() => Date.now()),
  },
  (table) => [index("idx_feeds_category").on(table.category)],
);

export const savedSites = sqliteTable(
  "saved_sites",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    url: text("url").notNull(),
    category: text("category").notNull().default("未分類"),
    faviconUrl: text("favicon_url"),
    createdAt: integer("created_at")
      .notNull()
      .$defaultFn(() => Date.now()),
  },
  (table) => [
    uniqueIndex("idx_saved_sites_url").on(table.url),
    index("idx_saved_sites_category").on(table.category),
  ],
);

export const articles = sqliteTable(
  "articles",
  {
    id: text("id").primaryKey(),
    feedId: text("feed_id")
      .notNull()
      .references(() => feeds.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    url: text("url").notNull(),
    author: text("author"),
    contentHtml: text("content_html"),
    browserImportedAt: integer("browser_imported_at"),
    contentPlain: text("content_plain"),
    thumbnailUrl: text("thumbnail_url"),
    publishedAt: integer("published_at"),
    sortKey: integer("sort_key").notNull(),
    detectedLanguage: text("detected_language"),
    dedupHash: text("dedup_hash").notNull(),
    isRead: integer("is_read", { mode: "boolean" }).notNull().default(false),
    isReadLater: integer("is_read_later", { mode: "boolean" }).notNull().default(false),
    isStarred: integer("is_starred", { mode: "boolean" }).notNull().default(false),
    readAt: integer("read_at"),
    aiSummaryShort: text("ai_summary_short"),
    aiTitleJa: text("ai_title_ja"),
    aiTags: text("ai_tags"),
    manualClassification: text("manual_classification"),
    aiStage1Status: text("ai_stage1_status").notNull().default("pending"),
    aiStage1Error: text("ai_stage1_error"),
    aiStage1ProcessedAt: integer("ai_stage1_processed_at"),
    aiSummaryFull: text("ai_summary_full"),
    aiTranslation: text("ai_translation"),
    aiKeyPoints: text("ai_key_points"),
    aiRelatedLinks: text("ai_related_links"),
    aiStage2Status: text("ai_stage2_status").notNull().default("none"),
    aiStage2Error: text("ai_stage2_error"),
    aiStage2ProcessedAt: integer("ai_stage2_processed_at"),
    note: text("note"),
    createdAt: integer("created_at")
      .notNull()
      .$defaultFn(() => Date.now()),
  },
  (table) => [
    uniqueIndex("idx_articles_dedup").on(table.feedId, table.dedupHash),
    index("idx_articles_sort").on(table.sortKey, table.id),
    index("idx_articles_feed_sort").on(table.feedId, table.sortKey, table.id),
    index("idx_articles_is_read").on(table.isRead),
    index("idx_articles_is_read_later").on(table.isReadLater),
    index("idx_articles_is_starred").on(table.isStarred),
  ],
);

export const pushSubscriptions = sqliteTable("push_subscriptions", {
  id: text("id").primaryKey(),
  endpoint: text("endpoint").notNull().unique(),
  keysP256dh: text("keys_p256dh").notNull(),
  keysAuth: text("keys_auth").notNull(),
  createdAt: integer("created_at").notNull().$defaultFn(() => Date.now()),
});

export type Feed = typeof feeds.$inferSelect;
export type NewFeed = typeof feeds.$inferInsert;
export type SavedSite = typeof savedSites.$inferSelect;
export type NewSavedSite = typeof savedSites.$inferInsert;
export type Article = typeof articles.$inferSelect;
export type NewArticle = typeof articles.$inferInsert;

export const aiUsage = sqliteTable("ai_usage", {
  id: text("id").primaryKey(),
  createdAt: integer("created_at").notNull(),
  provider: text("provider").notNull(),
  model: text("model").notNull(),
  purpose: text("purpose").notNull(),
  status: text("status").notNull(),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  inputUsdPerMillion: real("input_usd_per_million").notNull(),
  outputUsdPerMillion: real("output_usd_per_million").notNull(),
  yenPerUsd: real("yen_per_usd").notNull(),
  reservedYen: real("reserved_yen").notNull(),
  costYen: real("cost_yen").notNull(),
  completedAt: integer("completed_at"),
}, table => [index("idx_ai_usage_created").on(table.createdAt)]);

export const articleBrowserImports = sqliteTable("article_browser_imports", {
  articleId: text("article_id").primaryKey().references(() => articles.id, {onDelete:"cascade"}),
  originalHtml: text("original_html"),
  originalPlain: text("original_plain"),
  importedAt: integer("imported_at").notNull(),
});

export const savedFilters = sqliteTable("saved_filters", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  conditions: text("conditions").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const aiResultCache = sqliteTable("ai_result_cache", {
  cacheKey: text("cache_key").primaryKey(),
  content: text("content"),
  owner: text("owner"),
  expiresAt: integer("expires_at").notNull(),
  reuseCount: integer("reuse_count").notNull().default(0),
}, table => [index("idx_ai_result_cache_expires").on(table.expiresAt)]);
