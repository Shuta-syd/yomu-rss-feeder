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
import { listArticles } from "@/lib/articles-query";

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

function insertArticle(id: string, feedId: string, sortKey: number) {
  testDb.raw
    .prepare(
      `INSERT INTO articles (
        id, feed_id, title, url, dedup_hash, sort_key,
        is_read, is_starred, ai_stage1_status, ai_stage2_status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, 0, 0, 'pending', 'none', ?)`,
    )
    .run(
      id,
      feedId,
      `Article ${id}`,
      `https://example.com/a/${id}`,
      `hash-${id}`,
      sortKey,
      Date.now(),
    );
}

describe("listArticles - category filter", () => {
  beforeEach(() => {
    testDb.raw.exec("DELETE FROM articles; DELETE FROM feeds;");
  });

  it("カテゴリ指定でそのカテゴリのフィードの記事だけが返る", () => {
    insertFeed("f1", "Blog Feed 1", "BLOG");
    insertFeed("f2", "Blog Feed 2", "BLOG");
    insertFeed("f3", "Crypto Feed", "CRYPTO");
    insertArticle("a1", "f1", 100);
    insertArticle("a2", "f2", 200);
    insertArticle("a3", "f3", 300);

    const result = listArticles({ category: "BLOG" });

    expect(result.articles.map((a) => a.id).sort()).toEqual(["a1", "a2"]);
    expect(result.total).toBe(2);
  });

  it("空白入りカテゴリ名 (COMPANY BLOG) を扱える", () => {
    insertFeed("f1", "Engineer Blog", "COMPANY BLOG");
    insertFeed("f2", "Other", "BLOG");
    insertArticle("a1", "f1", 100);
    insertArticle("a2", "f2", 200);

    const result = listArticles({ category: "COMPANY BLOG" });

    expect(result.articles.map((a) => a.id)).toEqual(["a1"]);
    expect(result.total).toBe(1);
  });

  it("日本語カテゴリ名 (未分類) を扱える", () => {
    insertFeed("f1", "Some Feed", "未分類");
    insertArticle("a1", "f1", 100);

    const result = listArticles({ category: "未分類" });

    expect(result.total).toBe(1);
  });

  it("feedId と category 同時指定時は feedId が優先される", () => {
    insertFeed("f1", "F1", "BLOG");
    insertFeed("f2", "F2", "BLOG");
    insertArticle("a1", "f1", 100);
    insertArticle("a2", "f2", 200);

    const result = listArticles({ feedId: "f1", category: "BLOG" });

    expect(result.articles.map((a) => a.id)).toEqual(["a1"]);
    expect(result.total).toBe(1);
  });

  it("マッチするフィードがない場合は空配列", () => {
    insertFeed("f1", "F1", "BLOG");
    insertArticle("a1", "f1", 100);

    const result = listArticles({ category: "NOTHING" });

    expect(result.articles).toEqual([]);
    expect(result.total).toBe(0);
  });
});

describe("listArticles - article classification", () => {
  beforeEach(() => { testDb.raw.exec("DELETE FROM articles; DELETE FROM feeds;"); });
  it("filters across feeds before pagination and tolerates missing or malformed tags", () => {
    insertFeed("f1", "News", "Business"); insertFeed("f2", "Bookmarks", "Blog");
    for (const [id,feed,date,tags] of [["a1","f1",1,'["業界:食品・農業"]'],["a2","f2",2,'["業界:食品・農業"]'],["a3","f2",3,'not json'],["a4","f1",4,null]] as const) {
      insertArticle(id,feed,date); testDb.raw.prepare("UPDATE articles SET ai_tags=? WHERE id=?").run(tags,id);
    }
    const first=listArticles({classification:"業界:食品・農業",limit:1});
    expect(first.total).toBe(2); expect(first.articles.map(a=>a.id)).toEqual(["a2"]);
    expect(listArticles({classification:"業界:食品・農業",cursor:first.nextCursor!,limit:1}).articles.map(a=>a.id)).toEqual(["a1"]);
    expect(listArticles({classification:"業界:食品・農業",feedId:"f1"}).articles.map(a=>a.id)).toEqual(["a1"]);
  });
});

describe('combined classification intersection',()=>{
 it('requires every selected axis before pagination',()=>{
  testDb.raw.exec('DELETE FROM articles; DELETE FROM feeds;');insertFeed('f','Feed','Business');
  for(const [id,key,tags] of [['a',400,['業界:食品・農業','テーマ:AI']],['b',300,['業界:食品・農業']],['c',200,['テーマ:AI']],['d',100,['業界:食品・農業','テーマ:AI']]] as const){
   insertArticle(id,'f',key);testDb.raw.prepare('UPDATE articles SET ai_tags=? WHERE id=?').run(JSON.stringify(tags),id);
  }
  const first=listArticles({classifications:['業界:食品・農業','テーマ:AI'],limit:1});
  expect(first.articles.map(a=>a.id)).toEqual(['a']);expect(first.total).toBe(2);
  expect(listArticles({classifications:['業界:食品・農業','テーマ:AI'],cursor:first.nextCursor!,limit:1}).articles.map(a=>a.id)).toEqual(['d']);
 });
});
