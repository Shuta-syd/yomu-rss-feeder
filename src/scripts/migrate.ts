import Database from "better-sqlite3";
import { readFileSync, readdirSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

const DB_PATH = process.env.DATABASE_PATH ?? "data/yomu.db";
const MIGRATIONS_DIR = process.env.MIGRATIONS_DIR ?? "./drizzle";

mkdirSync(dirname(DB_PATH), { recursive: true });

const sqlite = new Database(DB_PATH);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

function tableExists(name: string): boolean {
  const row = sqlite
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(name);
  return Boolean(row);
}

function hasArticleFtsTrigger(): boolean {
  const row = sqlite
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'trigger' AND sql LIKE '%articles_fts%'")
    .get();
  return Boolean(row);
}

function tableHasColumns(tableName: string, required: string[]): boolean {
  const columns = sqlite
    .prepare(`PRAGMA table_info('${tableName}')`)
    .all() as Array<{ name: string }>;
  const names = new Set(columns.map((column) => column.name));
  return required.every((name) => names.has(name));
}

function repairMissingArticlesFtsTable(): void {
  if (!tableExists("articles") || tableExists("articles_fts") || !hasArticleFtsTrigger()) {
    return;
  }
  const required = [
    "title",
    "content_plain",
    "ai_summary_short",
    "ai_summary_full",
    "ai_translation",
  ];
  if (!tableHasColumns("articles", required)) {
    throw new Error(
      "[yomu] Found articles_fts triggers without articles_fts, but the articles schema did not match. Refusing automatic repair.",
    );
  }

  const tx = sqlite.transaction(() => {
    sqlite.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS articles_fts USING fts5(
        title,
        content_plain,
        ai_summary_short,
        ai_summary_full,
        ai_translation,
        content='articles',
        content_rowid='rowid'
      );
    `);
    sqlite.exec("INSERT INTO articles_fts(articles_fts) VALUES ('rebuild');");
  });
  tx();
  console.log("[yomu] Repaired missing articles_fts table.");
}

function repairInterruptedFeedsTableMigration(): void {
  if (tableExists("feeds") || !tableExists("__new_feeds")) return;

  const required = ["id", "title", "url", "category", "created_at"];
  if (!tableHasColumns("__new_feeds", required)) {
    throw new Error(
      "[yomu] Found __new_feeds without feeds, but the schema did not match. Refusing automatic repair.",
    );
  }

  const tx = sqlite.transaction(() => {
    sqlite.exec('ALTER TABLE "__new_feeds" RENAME TO "feeds";');
    sqlite.exec('CREATE UNIQUE INDEX IF NOT EXISTS "feeds_url_unique" ON "feeds" ("url");');
    sqlite.exec('CREATE INDEX IF NOT EXISTS "idx_feeds_category" ON "feeds" ("category");');
  });
  tx();
  console.log("[yomu] Repaired interrupted feeds table migration.");
}

repairMissingArticlesFtsTable();
repairInterruptedFeedsTableMigration();

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS __migrations (
    tag TEXT PRIMARY KEY,
    applied_at INTEGER NOT NULL
  );
`);

const applied = new Set(
  sqlite
    .prepare<[], { tag: string }>("SELECT tag FROM __migrations")
    .all()
    .map((r) => r.tag),
);

const files = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort();

for (const file of files) {
  const tag = file.replace(/\.sql$/, "");
  if (applied.has(tag)) {
    continue;
  }
  const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
  const statements = sql
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const tx = sqlite.transaction(() => {
    for (const stmt of statements) {
      sqlite.exec(stmt);
    }
    sqlite
      .prepare("INSERT INTO __migrations (tag, applied_at) VALUES (?, ?)")
      .run(tag, Date.now());
  });
  tx();
  console.log(`[yomu] Applied migration: ${tag}`);
}

console.log("[yomu] Migrations complete.");
sqlite.close();
