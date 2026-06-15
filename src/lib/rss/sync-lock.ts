import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { appConfig } from "../db/schema";
import { readPositiveIntEnv } from "../env";

const LOCK_KEY = "sync_lock";
const LOCK_TIMEOUT_MS = readPositiveIntEnv("YOMU_SYNC_LOCK_TIMEOUT_MS", 10 * 60 * 1000);

export interface SyncLockHandle {
  token: string;
}

interface SyncLockState {
  heartbeatAt: number;
  token: string | null;
}

function encodeLockValue(handle: SyncLockHandle, nowMs: number): string {
  return `${nowMs}:${handle.token}`;
}

function parseLockValue(value: string): SyncLockState | null {
  const [heartbeat, token] = value.split(":");
  const heartbeatAt = Number.parseInt(heartbeat ?? "", 10);
  if (!Number.isFinite(heartbeatAt)) return null;

  return {
    heartbeatAt,
    token: token || null,
  };
}

export function acquireSyncLock(nowMs: number = Date.now()): SyncLockHandle | null {
  const existing = db
    .select()
    .from(appConfig)
    .where(eq(appConfig.key, LOCK_KEY))
    .get();

  if (existing) {
    const state = parseLockValue(existing.value);
    if (state && nowMs - state.heartbeatAt < LOCK_TIMEOUT_MS) {
      return null;
    }
  }

  const handle = { token: randomUUID() };
  db.insert(appConfig)
    .values({ key: LOCK_KEY, value: encodeLockValue(handle, nowMs) })
    .onConflictDoUpdate({
      target: appConfig.key,
      set: { value: encodeLockValue(handle, nowMs) },
    })
    .run();
  return handle;
}

export function refreshSyncLock(handle: SyncLockHandle, nowMs: number = Date.now()): boolean {
  const existing = db
    .select()
    .from(appConfig)
    .where(eq(appConfig.key, LOCK_KEY))
    .get();
  const state = existing ? parseLockValue(existing.value) : null;
  if (!state || state.token !== handle.token) return false;

  db.update(appConfig)
    .set({ value: encodeLockValue(handle, nowMs) })
    .where(eq(appConfig.key, LOCK_KEY))
    .run();
  return true;
}

export function releaseSyncLock(handle?: SyncLockHandle): void {
  if (handle) {
    const existing = db
      .select()
      .from(appConfig)
      .where(eq(appConfig.key, LOCK_KEY))
      .get();
    const state = existing ? parseLockValue(existing.value) : null;
    if (!state || state.token !== handle.token) return;
  }

  db.delete(appConfig).where(eq(appConfig.key, LOCK_KEY)).run();
}

export async function withSyncLock<T>(
  fn: () => Promise<T>,
): Promise<T | { locked: true }> {
  const handle = acquireSyncLock();
  if (!handle) return { locked: true };
  try {
    return await fn();
  } finally {
    releaseSyncLock(handle);
  }
}
