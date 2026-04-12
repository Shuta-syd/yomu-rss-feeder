import { eq } from "drizzle-orm";
import { db } from "../db";
import { appConfig } from "../db/schema";

const LOCK_KEY = "sync_lock";
const LOCK_TIMEOUT_MS = 10 * 60 * 1000;

export function acquireSyncLock(nowMs: number = Date.now()): boolean {
  const existing = db
    .select()
    .from(appConfig)
    .where(eq(appConfig.key, LOCK_KEY))
    .get();

  if (existing) {
    const lockedAt = Number.parseInt(existing.value, 10);
    if (Number.isFinite(lockedAt) && nowMs - lockedAt < LOCK_TIMEOUT_MS) {
      return false;
    }
  }

  db.insert(appConfig)
    .values({ key: LOCK_KEY, value: String(nowMs) })
    .onConflictDoUpdate({ target: appConfig.key, set: { value: String(nowMs) } })
    .run();
  return true;
}

export function releaseSyncLock(): void {
  db.delete(appConfig).where(eq(appConfig.key, LOCK_KEY)).run();
}

export async function withSyncLock<T>(
  fn: () => Promise<T>,
): Promise<T | { locked: true }> {
  if (!acquireSyncLock()) return { locked: true };
  try {
    return await fn();
  } finally {
    releaseSyncLock();
  }
}
