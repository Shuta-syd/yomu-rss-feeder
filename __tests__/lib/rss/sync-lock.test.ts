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
const { acquireSyncLock, refreshSyncLock, releaseSyncLock } = await import("@/lib/rss/sync-lock");
const { appConfig } = await import("@/lib/db/schema");

describe("sync-lock", () => {
  beforeEach(() => {
    db.delete(appConfig).run();
  });

  it("ロックがなければ取得成功", () => {
    expect(acquireSyncLock()).toEqual({ token: expect.any(String) });
  });

  it("ロック中は二重取得不可", () => {
    const t = 1_000_000_000_000;
    expect(acquireSyncLock(t)).toEqual({ token: expect.any(String) });
    expect(acquireSyncLock(t + 1000)).toBeNull();
  });

  it("10分経過後のロックは奪取可能", () => {
    const t = 1_000_000_000_000;
    expect(acquireSyncLock(t)).toEqual({ token: expect.any(String) });
    expect(acquireSyncLock(t + 10 * 60 * 1000 + 1)).toEqual({
      token: expect.any(String),
    });
  });

  it("release 後は再取得可能", () => {
    const handle = acquireSyncLock();
    expect(handle).toEqual({ token: expect.any(String) });
    releaseSyncLock(handle ?? undefined);
    expect(acquireSyncLock()).toEqual({ token: expect.any(String) });
  });

  it("heartbeat 更新中は stale 扱いしない", () => {
    const t = 1_000_000_000_000;
    const handle = acquireSyncLock(t);
    expect(handle).toEqual({ token: expect.any(String) });
    expect(refreshSyncLock(handle!, t + 9 * 60 * 1000)).toBe(true);
    expect(acquireSyncLock(t + 10 * 60 * 1000 + 1)).toBeNull();
  });

  it("古い handle の release は新しいロックを消さない", () => {
    const t = 1_000_000_000_000;
    const first = acquireSyncLock(t);
    const second = acquireSyncLock(t + 10 * 60 * 1000 + 1);
    expect(first).toEqual({ token: expect.any(String) });
    expect(second).toEqual({ token: expect.any(String) });

    releaseSyncLock(first ?? undefined);
    expect(acquireSyncLock(t + 10 * 60 * 1000 + 2)).toBeNull();

    releaseSyncLock(second ?? undefined);
    expect(acquireSyncLock(t + 10 * 60 * 1000 + 3)).toEqual({
      token: expect.any(String),
    });
  });
});
