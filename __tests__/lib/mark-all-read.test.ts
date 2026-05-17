import { describe, it, expect, beforeEach, beforeAll, vi } from "vitest";
import type { createTestDb as CreateTestDb } from "../helpers/test-db";

type TestDbInstance = ReturnType<typeof CreateTestDb>;
let testDb!: TestDbInstance;

vi.mock("@/lib/db", () => ({
  get db() {
    return testDb.db;
  },
  get rawDb() {
    return testDb.raw;
  },
}));

import { createTestDb } from "../helpers/test-db";
import {
  validateMarkAllReadInput,
  markAllRead,
} from "@/lib/mark-all-read";

beforeAll(() => {
  testDb = createTestDb();
});

function insertFeed(id: string, title: string, category: string) {
  testDb.raw
    .prepare(
      "INSERT INTO feeds (id, title, url, category, fetch_interval_min, last_fetch_status, consecutive_fetch_failures, ai_enabled, created_at) VALUES (?, ?, ?, ?, 30, 'pending', 0, 1, ?)",
    )
    .run(id, title, `https://example.com/${id}`, category, Date.now());
}

function insertArticle(id: string, feedId: string, sortKey: number, isRead = false) {
  testDb.raw
    .prepare(
      `INSERT INTO articles (
        id, feed_id, title, url, dedup_hash, sort_key,
        is_read, is_starred, ai_stage1_status, ai_stage2_status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'pending', 'none', ?)`,
    )
    .run(
      id,
      feedId,
      `Article ${id}`,
      `https://example.com/a/${id}`,
      `hash-${id}`,
      sortKey,
      isRead ? 1 : 0,
      Date.now(),
    );
}

describe("validateMarkAllReadInput", () => {
  it("空オブジェクトは全件モード", () => {
    expect(validateMarkAllReadInput({})).toEqual({ ok: true, scope: { kind: "all" } });
  });
  it("feedId のみは feed モード", () => {
    expect(validateMarkAllReadInput({ feedId: "abc" })).toEqual({
      ok: true,
      scope: { kind: "feed", feedId: "abc" },
    });
  });
  it("category のみは category モード", () => {
    expect(validateMarkAllReadInput({ category: "BLOG" })).toEqual({
      ok: true,
      scope: { kind: "category", category: "BLOG" },
    });
  });
  it("category は trim される", () => {
    expect(validateMarkAllReadInput({ category: "  BLOG  " })).toEqual({
      ok: true,
      scope: { kind: "category", category: "BLOG" },
    });
  });
  it("feedId と category 同時指定は error", () => {
    expect(validateMarkAllReadInput({ feedId: "abc", category: "BLOG" })).toEqual({
      ok: false,
      error: "feedId と category は同時指定できません",
    });
  });
  it("空文字 category は無視されて全件モード", () => {
    expect(validateMarkAllReadInput({ category: "  " })).toEqual({
      ok: true,
      scope: { kind: "all" },
    });
  });
});

describe("markAllRead", () => {
  beforeEach(() => {
    testDb.raw.exec("DELETE FROM articles; DELETE FROM feeds;");
  });

  it("category 指定でそのカテゴリの未読のみ既読化される", () => {
    insertFeed("f1", "Blog 1", "BLOG");
    insertFeed("f2", "Crypto", "CRYPTO");
    insertArticle("a1", "f1", 100);
    insertArticle("a2", "f1", 200);
    insertArticle("a3", "f2", 300);

    const updated = markAllRead({ kind: "category", category: "BLOG" });

    expect(updated).toBe(2);
    const remaining = testDb.raw
      .prepare("SELECT id FROM articles WHERE is_read = 0 ORDER BY id")
      .all() as { id: string }[];
    expect(remaining.map((r) => r.id)).toEqual(["a3"]);
  });

  it("feed 指定でそのフィードの未読のみ既読化される", () => {
    insertFeed("f1", "F1", "BLOG");
    insertFeed("f2", "F2", "BLOG");
    insertArticle("a1", "f1", 100);
    insertArticle("a2", "f2", 200);

    const updated = markAllRead({ kind: "feed", feedId: "f1" });

    expect(updated).toBe(1);
    const remaining = testDb.raw
      .prepare("SELECT id FROM articles WHERE is_read = 0")
      .all() as { id: string }[];
    expect(remaining.map((r) => r.id)).toEqual(["a2"]);
  });

  it("all 指定で全未読が既読化される", () => {
    insertFeed("f1", "F1", "BLOG");
    insertArticle("a1", "f1", 100);
    insertArticle("a2", "f1", 200, true); // 既に既読

    const updated = markAllRead({ kind: "all" });

    expect(updated).toBe(1); // 未読1件のみ更新
    const remaining = testDb.raw
      .prepare("SELECT id FROM articles WHERE is_read = 0")
      .all() as { id: string }[];
    expect(remaining).toEqual([]);
  });
});
