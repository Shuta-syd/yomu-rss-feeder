import { sqliteTable, text, integer, uniqueIndex, index } from "drizzle-orm/sqlite-core";

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
    createdAt: integer("created_at")
      .notNull()
      .$defaultFn(() => Date.now()),
  },
  (table) => [index("idx_feeds_category").on(table.category)],
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
    contentPlain: text("content_plain"),
    thumbnailUrl: text("thumbnail_url"),
    publishedAt: integer("published_at"),
    sortKey: integer("sort_key").notNull(),
    detectedLanguage: text("detected_language"),
    dedupHash: text("dedup_hash").notNull(),
    isRead: integer("is_read", { mode: "boolean" }).notNull().default(false),
    isStarred: integer("is_starred", { mode: "boolean" }).notNull().default(false),
    readAt: integer("read_at"),
    aiSummaryShort: text("ai_summary_short"),
    aiTitleJa: text("ai_title_ja"),
    aiTags: text("ai_tags"),
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
    createdAt: integer("created_at")
      .notNull()
      .$defaultFn(() => Date.now()),
  },
  (table) => [
    uniqueIndex("idx_articles_dedup").on(table.feedId, table.dedupHash),
    index("idx_articles_sort").on(table.sortKey, table.id),
    index("idx_articles_feed_sort").on(table.feedId, table.sortKey, table.id),
    index("idx_articles_is_read").on(table.isRead),
    index("idx_articles_is_starred").on(table.isStarred),
  ],
);

export const xLikes = sqliteTable(
  "x_likes",
  {
    id: text("id").primaryKey(), // tweet ID
    authorName: text("author_name").notNull(),
    authorUsername: text("author_username").notNull(),
    authorProfileImageUrl: text("author_profile_image_url"),
    text: text("text").notNull(),
    likedAt: integer("liked_at").notNull(), // epoch ms
    tweetCreatedAt: integer("tweet_created_at"),
    urls: text("urls"), // JSON array of expanded URLs
    mediaUrls: text("media_urls"), // JSON array
    replyCount: integer("reply_count"),
    retweetCount: integer("retweet_count"),
    likeCount: integer("like_count"),
    createdAt: integer("created_at")
      .notNull()
      .$defaultFn(() => Date.now()),
  },
  (table) => [index("idx_x_likes_liked_at").on(table.likedAt)],
);

export const xAnalyses = sqliteTable("x_analyses", {
  id: text("id").primaryKey(), // UUID v7
  periodStart: integer("period_start").notNull(),
  periodEnd: integer("period_end").notNull(),
  likeCount: integer("like_count").notNull(),
  summaryJson: text("summary_json").notNull(), // AI分析結果JSON
  createdAt: integer("created_at")
    .notNull()
    .$defaultFn(() => Date.now()),
});

export type Feed = typeof feeds.$inferSelect;
export type NewFeed = typeof feeds.$inferInsert;
export type Article = typeof articles.$inferSelect;
export type NewArticle = typeof articles.$inferInsert;
export type XLike = typeof xLikes.$inferSelect;
export type XAnalysis = typeof xAnalyses.$inferSelect;
