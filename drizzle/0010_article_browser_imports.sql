CREATE TABLE article_browser_imports (
 article_id TEXT PRIMARY KEY REFERENCES articles(id) ON DELETE CASCADE,
 original_html TEXT,
 original_plain TEXT,
 imported_at INTEGER NOT NULL
);
ALTER TABLE articles ADD COLUMN browser_imported_at INTEGER;
