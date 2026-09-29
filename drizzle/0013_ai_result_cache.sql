CREATE TABLE ai_result_cache (
  cache_key TEXT PRIMARY KEY NOT NULL,
  content TEXT,
  owner TEXT,
  expires_at INTEGER NOT NULL,
  reuse_count INTEGER NOT NULL DEFAULT 0
);
--> statement-breakpoint
CREATE INDEX idx_ai_result_cache_expires ON ai_result_cache(expires_at);
