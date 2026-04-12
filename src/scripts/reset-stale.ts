import Database from "better-sqlite3";

const DB_PATH = process.env.DATABASE_PATH ?? "data/yomu.db";
const db = new Database(DB_PATH);

db.exec(
  "UPDATE articles SET ai_stage1_status = 'pending' WHERE ai_stage1_status = 'processing'",
);
db.exec(
  "UPDATE articles SET ai_stage2_status = 'none' WHERE ai_stage2_status = 'processing'",
);

const tenMinAgo = Date.now() - 10 * 60 * 1000;
db.prepare(
  "DELETE FROM app_config WHERE key = 'sync_lock' AND CAST(value AS INTEGER) < ?",
).run(tenMinAgo);

console.log("[yomu] Stale states reset.");
db.close();
