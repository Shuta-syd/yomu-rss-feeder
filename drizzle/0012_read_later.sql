ALTER TABLE articles ADD COLUMN is_read_later INTEGER NOT NULL DEFAULT 0;
CREATE INDEX idx_articles_is_read_later ON articles(is_read_later);
