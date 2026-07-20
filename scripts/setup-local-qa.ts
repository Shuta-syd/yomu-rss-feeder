import bcrypt from "bcryptjs";
import Database from "better-sqlite3";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const projectRoot = process.cwd();
const qaDatabasePath = resolve(projectRoot, "data/yomu-qa.db");
const configuredDatabasePath = resolve(
  projectRoot,
  process.env.DATABASE_PATH ?? "",
);
const sourceDatabasePath = resolve(
  projectRoot,
  process.env.YOMU_QA_SOURCE_DATABASE_PATH ?? "data/yomu.db",
);
const uid = process.env.YOMU_QA_UID ?? "";
const password = process.env.YOMU_QA_PASSWORD ?? "";
const baseUrl = process.env.YOMU_QA_BASE_URL ?? "http://127.0.0.1:3391";

if (configuredDatabasePath !== qaDatabasePath) {
  throw new Error(
    `Refusing to modify a non-QA database. DATABASE_PATH must resolve to ${qaDatabasePath}`,
  );
}
if (sourceDatabasePath === qaDatabasePath) {
  throw new Error("The QA source and destination databases must be different.");
}
if (!/^\d{10}$/.test(uid)) {
  throw new Error("YOMU_QA_UID must be exactly 10 digits.");
}
if (password.length < 8 || password.length > 256) {
  throw new Error("YOMU_QA_PASSWORD must be between 8 and 256 characters.");
}

mkdirSync(dirname(qaDatabasePath), { recursive: true });

if (!existsSync(qaDatabasePath)) {
  if (!existsSync(sourceDatabasePath)) {
    throw new Error(`QA source database was not found: ${sourceDatabasePath}`);
  }
  const source = new Database(sourceDatabasePath, { readonly: true });
  try {
    await source.backup(qaDatabasePath);
  } finally {
    source.close();
  }
  console.log(`[yomu] Copied QA data from ${sourceDatabasePath}.`);
}

const passwordHash = await bcrypt.hash(password, 12);
const qaDb = new Database(qaDatabasePath);
try {
  const hasAppConfig = qaDb
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'app_config'")
    .get();
  if (!hasAppConfig) {
    throw new Error("The QA database does not contain the app_config table.");
  }

  const upsert = qaDb.prepare(`
    INSERT INTO app_config (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `);
  qaDb.transaction(() => {
    upsert.run("uid", uid);
    upsert.run("password_hash", passwordHash);
    upsert.run("setup_completed", "true");
    qaDb
      .prepare(`
        DELETE FROM app_config
        WHERE key IN (
          'session_hash',
          'session_expires_at',
          'gemini_api_key',
          'openai_api_key',
          'anthropic_api_key'
        )
      `)
      .run();
  })();
} finally {
  qaDb.close();
}

console.log(`[yomu] Local QA login is ready at ${baseUrl}.`);
console.log(`[yomu] QA UID: ${uid}`);
console.log("[yomu] QA password is stored only in .env.qa.local.");
