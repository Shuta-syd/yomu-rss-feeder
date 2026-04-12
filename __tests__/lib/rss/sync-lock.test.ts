import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/db", async () => {
  const { createTestDb } = await import("../../helpers/test-db");
  const t = createTestDb();
  return {
    db: t.db,
    rawDb: t.raw,
    schema: {},
    now: () => Date.now(),
  };
});

const { db } = await import("@/lib/db");
const { acquireSyncLock, releaseSyncLock } = await import("@/lib/rss/sync-lock");
const { appConfig } = await import("@/lib/db/schema");

describe("sync-lock", () => {
  beforeEach(() => {
    db.delete(appConfig).run();
  });

  it("ロックがなければ取得成功", () => {
    expect(acquireSyncLock()).toBe(true);
  });

  it("ロック中は二重取得不可", () => {
    const t = 1_000_000_000_000;
    expect(acquireSyncLock(t)).toBe(true);
    expect(acquireSyncLock(t + 1000)).toBe(false);
  });

  it("10分経過後のロックは奪取可能", () => {
    const t = 1_000_000_000_000;
    expect(acquireSyncLock(t)).toBe(true);
    expect(acquireSyncLock(t + 10 * 60 * 1000 + 1)).toBe(true);
  });

  it("release 後は再取得可能", () => {
    expect(acquireSyncLock()).toBe(true);
    releaseSyncLock();
    expect(acquireSyncLock()).toBe(true);
  });
});
