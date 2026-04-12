import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import * as schema from "@/lib/db/schema";

export type TestDb = ReturnType<typeof drizzle<typeof schema>>;

export function createTestDb(): { db: TestDb; close: () => void; raw: Database.Database } {
  const sqlite = new Database(":memory:");
  sqlite.pragma("journal_mode = MEMORY");
  sqlite.pragma("foreign_keys = ON");

  const dir = "drizzle";
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const f of files) {
    const sql = readFileSync(join(dir, f), "utf8");
    for (const stmt of sql.split("--> statement-breakpoint")) {
      const trimmed = stmt.trim();
      if (trimmed) sqlite.exec(trimmed);
    }
  }

  return {
    db: drizzle(sqlite, { schema }),
    close: () => sqlite.close(),
    raw: sqlite,
  };
}
