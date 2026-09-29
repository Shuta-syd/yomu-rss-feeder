CREATE TABLE ai_usage (
 id TEXT PRIMARY KEY,
 created_at INTEGER NOT NULL,
 provider TEXT NOT NULL,
 model TEXT NOT NULL,
 purpose TEXT NOT NULL,
 status TEXT NOT NULL,
 input_tokens INTEGER,
 output_tokens INTEGER,
 input_usd_per_million REAL NOT NULL,
 output_usd_per_million REAL NOT NULL,
 yen_per_usd REAL NOT NULL,
 reserved_yen REAL NOT NULL,
 cost_yen REAL NOT NULL,
 completed_at INTEGER
);
CREATE INDEX idx_ai_usage_created ON ai_usage(created_at);
