import Database from "better-sqlite3";
import { readFileSync, readdirSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

const DB_PATH = process.env.DATABASE_PATH ?? "data/yomu.db";
const MIGRATIONS_DIR = process.env.MIGRATIONS_DIR ?? "./drizzle";

mkdirSync(dirname(DB_PATH), { recursive: true });

const sqlite = new Database(DB_PATH);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

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
