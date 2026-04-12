-- FTS5 全文検索: articles_fts 仮想テーブル + 同期トリガー

CREATE VIRTUAL TABLE IF NOT EXISTS `articles_fts` USING fts5(
  title,
  content_plain,
  ai_summary_short,
  ai_summary_full,
  ai_translation,
  content='articles',
  content_rowid='rowid'
);
--> statement-breakpoint

CREATE TRIGGER IF NOT EXISTS `articles_fts_insert` AFTER INSERT ON `articles` BEGIN
  INSERT INTO articles_fts(rowid, title, content_plain, ai_summary_short, ai_summary_full, ai_translation)
  VALUES (new.rowid, new.title, new.content_plain, new.ai_summary_short, new.ai_summary_full, new.ai_translation);
END;
--> statement-breakpoint

CREATE TRIGGER IF NOT EXISTS `articles_fts_update` AFTER UPDATE ON `articles` BEGIN
  INSERT INTO articles_fts(articles_fts, rowid, title, content_plain, ai_summary_short, ai_summary_full, ai_translation)
  VALUES ('delete', old.rowid, old.title, old.content_plain, old.ai_summary_short, old.ai_summary_full, old.ai_translation);
  INSERT INTO articles_fts(rowid, title, content_plain, ai_summary_short, ai_summary_full, ai_translation)
  VALUES (new.rowid, new.title, new.content_plain, new.ai_summary_short, new.ai_summary_full, new.ai_translation);
END;
--> statement-breakpoint

CREATE TRIGGER IF NOT EXISTS `articles_fts_delete` AFTER DELETE ON `articles` BEGIN
  INSERT INTO articles_fts(articles_fts, rowid, title, content_plain, ai_summary_short, ai_summary_full, ai_translation)
  VALUES ('delete', old.rowid, old.title, old.content_plain, old.ai_summary_short, old.ai_summary_full, old.ai_translation);
END;
