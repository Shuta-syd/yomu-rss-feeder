# カテゴリ別記事表示 実装プラン

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** サイドバーのカテゴリ名クリックで、そのカテゴリに属する全フィードの記事を一覧表示できるようにする。

**Architecture:** バックエンドは `/api/articles` / `/api/articles/mark-all-read` に `category` パラメータを追加し、`a.feed_id IN (SELECT id FROM feeds WHERE category = ?)` のサブクエリで絞り込む。フロントは `selectedCategory: string | null` state を追加し、`selectedFeedId` と排他に管理する。サイドバーはカテゴリ名ボタン / 開閉アイコン / ホバー時ペンシルボタンの3要素にヘッダを分割する。

**Tech Stack:** Next.js 16.2 App Router, TypeScript, Drizzle ORM, better-sqlite3, Vitest, Tailwind CSS

**Spec:** [`docs/superpowers/specs/2026-05-17-category-filter-design.md`](../specs/2026-05-17-category-filter-design.md)

---

## File Structure

| ファイル | 役割 |
|---------|---------|
| `src/lib/articles-query.ts` | `listArticles` に `category` パラメータ追加、SQL を feed-id サブクエリ方式に統一 |
| `src/app/api/articles/route.ts` | クエリパラメータ `category` を受け取り、trim 正規化して `listArticles` へ |
| `src/app/api/articles/mark-all-read/route.ts` | body schema 拡張、`category` 指定時のサブクエリ UPDATE |
| `src/components/feeds/FeedSidebar.tsx` | カテゴリヘッダ分割、選択ハイライト、未読数表示、rename UI 移行 |
| `src/app/feeds/page.tsx` | `selectedCategory` state、排他クリア、loadArticles/markAllRead 拡張、rename/削除同期 |
| `__tests__/lib/articles-query.test.ts` | `category` 絞り込み・正規化テスト (新規) |
| `__tests__/lib/mark-all-read.test.ts` | mark-all-read の `category` 排他バリデーション (新規、純粋関数化した検証ロジックをテスト) |

---

## Task 1: articles-query に category パラメータを追加（TDD）

**Files:**
- Modify: `src/lib/articles-query.ts:1-130`
- Test: `__tests__/lib/articles-query.test.ts` (新規)

- [ ] **Step 1: 失敗するテストを作成**

`__tests__/lib/articles-query.test.ts` を新規作成:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestDb } from "../helpers/db";

const testDb = createTestDb();

vi.mock("@/lib/db", () => ({
  db: testDb.db,
  rawDb: testDb.raw,
}));

import { listArticles } from "@/lib/articles-query";

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
    .run(id, feedId, `Article ${id}`, `https://example.com/a/${id}`, `hash-${id}`, sortKey, Date.now());
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
```

- [ ] **Step 2: テストが失敗することを確認**

```bash
pnpm test -- __tests__/lib/articles-query.test.ts
```
期待: FAIL（`category` パラメータは未実装で全件返るため total が合わない）

- [ ] **Step 3: 最小実装**

[src/lib/articles-query.ts:6-13](src/lib/articles-query.ts#L6-L13) の `ArticleListParams` を更新:

```ts
export interface ArticleListParams {
  feedId?: string;
  category?: string;
  isRead?: boolean;
  isStarred?: boolean;
  search?: string;
  cursor?: string;
  limit?: number;
}
```

[src/lib/articles-query.ts:79-110](src/lib/articles-query.ts#L79-L110) の WHERE 構築部とクエリを以下に置換:

```ts
export function listArticles(params: ArticleListParams): ArticleListResult {
  const limit = Math.min(params.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
  const where: string[] = [];
  const values: unknown[] = [];

  if (params.feedId) {
    where.push("a.feed_id = ?");
    values.push(params.feedId);
  } else if (params.category) {
    where.push("a.feed_id IN (SELECT id FROM feeds WHERE category = ?)");
    values.push(params.category);
  }
  if (params.isRead !== undefined) {
    where.push("a.is_read = ?");
    values.push(params.isRead ? 1 : 0);
  }
  if (params.isStarred !== undefined) {
    where.push("a.is_starred = ?");
    values.push(params.isStarred ? 1 : 0);
  }
  if (params.search && params.search.trim()) {
    const term = params.search.trim().replace(/"/g, '""');
    where.push(
      "a.rowid IN (SELECT rowid FROM articles_fts WHERE articles_fts MATCH ?)",
    );
    values.push(`"${term}"`);
  }

  const cursor = parseCursor(params.cursor);
  if (cursor) {
    where.push("(a.sort_key < ? OR (a.sort_key = ? AND a.id < ?))");
    values.push(cursor.sortKey, cursor.sortKey, cursor.id);
  }

  const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

  const rows = rawDb
    .prepare(
      `SELECT a.*, f.title AS feed_title FROM articles a LEFT JOIN feeds f ON f.id = a.feed_id ${whereSql} ORDER BY a.sort_key DESC, a.id DESC LIMIT ?`,
    )
    .all(...values, limit + 1) as Record<string, unknown>[];

  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const pageArticles = pageRows.map(rowToArticle);
  const last = pageArticles[pageArticles.length - 1];
  const nextCursor = hasMore && last ? makeCursor(last.sortKey, last.id) : null;

  const totalRow = rawDb
    .prepare<unknown[], { count: number }>(
      `SELECT COUNT(*) as count FROM articles a ${whereSql}`,
    )
    .get(...values);

  return {
    articles: pageArticles,
    nextCursor,
    total: totalRow?.count ?? 0,
  };
}
```

主な変更点:
- `category` を WHERE に追加（`feedId` 優先で排他）
- list / count どちらも同じ `where`/`values` を使うことで Codex 指摘のズレを解消（既存もこの形だが、サブクエリ `IN (SELECT ...)` を採用したので明示的に維持）

- [ ] **Step 4: テストが通ることを確認**

```bash
pnpm test -- __tests__/lib/articles-query.test.ts
```
期待: PASS（5 件すべて）

- [ ] **Step 5: コミット**

```bash
git add src/lib/articles-query.ts __tests__/lib/articles-query.test.ts
git commit -m "listArticles に category パラメータ追加"
```

---

## Task 2: `/api/articles` ルートで category クエリ受け取り

**Files:**
- Modify: `src/app/api/articles/route.ts`

- [ ] **Step 1: route.ts を修正**

`src/app/api/articles/route.ts` 全文を以下に置換:

```ts
import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-helpers";
import { listArticles } from "@/lib/articles-query";

function normalize(value: string | null): string | undefined {
  if (value === null) return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

export async function GET(req: NextRequest) {
  return withAuth(async () => {
    const sp = req.nextUrl.searchParams;
    const isRead = sp.get("isRead");
    const isStarred = sp.get("isStarred");
    const result = listArticles({
      feedId: normalize(sp.get("feedId")),
      category: normalize(sp.get("category")),
      isRead: isRead === null ? undefined : isRead === "true",
      isStarred: isStarred === null ? undefined : isStarred === "true",
      search: sp.get("search") ?? undefined,
      cursor: sp.get("cursor") ?? undefined,
      limit: sp.get("limit") ? Number(sp.get("limit")) : undefined,
    });
    return NextResponse.json(result);
  });
}
```

主な変更:
- `normalize` ヘルパで `feedId` / `category` の trim と空文字除去
- 既存 listArticles 側の排他ロジック（feedId 優先）に丸投げ

- [ ] **Step 2: 型チェック**

```bash
pnpm typecheck
```
期待: エラーなし

- [ ] **Step 3: コミット**

```bash
git add src/app/api/articles/route.ts
git commit -m "/api/articles に category クエリ追加"
```

---

## Task 3: mark-all-read に category 対応（TDD）

**Files:**
- Modify: `src/app/api/articles/mark-all-read/route.ts`
- Test: `__tests__/lib/mark-all-read.test.ts` (新規)

mark-all-read はリクエスト→DB という薄いラッパなので、route ハンドラを直接単体テストする代わりに、検証ロジックと UPDATE 文を関数として分離してテストする。

- [ ] **Step 1: 失敗するテストを作成**

`__tests__/lib/mark-all-read.test.ts` を新規作成:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestDb } from "../helpers/db";

const testDb = createTestDb();

vi.mock("@/lib/db", () => ({
  db: testDb.db,
  rawDb: testDb.raw,
}));

import {
  validateMarkAllReadInput,
  markAllRead,
} from "@/lib/mark-all-read";

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
    .run(id, feedId, `Article ${id}`, `https://example.com/a/${id}`, `hash-${id}`, sortKey, isRead ? 1 : 0, Date.now());
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
});
```

- [ ] **Step 2: テスト実行（FAIL）**

```bash
pnpm test -- __tests__/lib/mark-all-read.test.ts
```
期待: FAIL（`@/lib/mark-all-read` モジュールがまだない）

- [ ] **Step 3: ロジックを `src/lib/mark-all-read.ts` に切り出す**

新規 `src/lib/mark-all-read.ts`:

```ts
import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "./db";
import { articles, feeds } from "./db/schema";

const bodySchema = z
  .object({
    feedId: z.string().optional(),
    category: z.string().optional(),
  })
  .partial();

export type MarkAllReadScope =
  | { kind: "all" }
  | { kind: "feed"; feedId: string }
  | { kind: "category"; category: string };

export type ValidateResult =
  | { ok: true; scope: MarkAllReadScope }
  | { ok: false; error: string };

export function validateMarkAllReadInput(input: unknown): ValidateResult {
  const parsed = bodySchema.safeParse(input ?? {});
  if (!parsed.success) {
    return { ok: false, error: "Invalid request" };
  }
  const feedId = parsed.data.feedId?.trim();
  const category = parsed.data.category?.trim();
  if (feedId && category) {
    return { ok: false, error: "feedId と category は同時指定できません" };
  }
  if (feedId) return { ok: true, scope: { kind: "feed", feedId } };
  if (category) return { ok: true, scope: { kind: "category", category } };
  return { ok: true, scope: { kind: "all" } };
}

export function markAllRead(scope: MarkAllReadScope): number {
  const now = Date.now();
  const baseWhere = eq(articles.isRead, false);

  if (scope.kind === "feed") {
    return db
      .update(articles)
      .set({ isRead: true, readAt: now })
      .where(and(eq(articles.feedId, scope.feedId), baseWhere))
      .run().changes;
  }
  if (scope.kind === "category") {
    const feedIdSubquery = db
      .select({ id: feeds.id })
      .from(feeds)
      .where(eq(feeds.category, scope.category));
    return db
      .update(articles)
      .set({ isRead: true, readAt: now })
      .where(and(inArray(articles.feedId, feedIdSubquery), baseWhere))
      .run().changes;
  }
  return db
    .update(articles)
    .set({ isRead: true, readAt: now })
    .where(baseWhere)
    .run().changes;
}
```

- [ ] **Step 4: route.ts を新ロジックに差し替え**

`src/app/api/articles/mark-all-read/route.ts` 全文を以下に置換:

```ts
import { NextRequest, NextResponse } from "next/server";
import { withAuth, jsonError } from "@/lib/api-helpers";
import { validateMarkAllReadInput, markAllRead } from "@/lib/mark-all-read";

export async function POST(req: NextRequest) {
  return withAuth(async () => {
    const json = await req.json().catch(() => ({}));
    const result = validateMarkAllReadInput(json);
    if (!result.ok) return jsonError(400, result.error);
    const updated = markAllRead(result.scope);
    return NextResponse.json({ updated });
  });
}
```

- [ ] **Step 5: テストが通ることを確認**

```bash
pnpm test -- __tests__/lib/mark-all-read.test.ts
pnpm typecheck
```
期待: PASS、型エラーなし

- [ ] **Step 6: コミット**

```bash
git add src/lib/mark-all-read.ts src/app/api/articles/mark-all-read/route.ts __tests__/lib/mark-all-read.test.ts
git commit -m "mark-all-read を category 対応・ロジック切り出し"
```

---

## Task 4: FeedSidebar に category 選択 UI 追加

**Files:**
- Modify: `src/components/feeds/FeedSidebar.tsx`

- [ ] **Step 1: Props 拡張**

[src/components/feeds/FeedSidebar.tsx:6-20](src/components/feeds/FeedSidebar.tsx#L6-L20) の `Props` を以下に変更:

```ts
interface Props {
  feeds: FeedWithUnread[];
  selectedFeedId: string | null;
  selectedCategory: string | null;
  onSelect: (feedId: string | null) => void;
  onSelectCategory: (category: string) => void;
  onAddFeed: () => void;
  onSync: () => void;
  syncing: boolean;
  onLogout: () => void;
  onFeedMoved?: () => void;
  onFeedsDeleted?: () => void;
  onCategoryRenamed?: (oldName: string, newName: string) => void;
  isMobile?: boolean;
  view?: "feeds" | "likes" | "starred";
  onSelectLikes?: () => void;
  onSelectStarred?: () => void;
}
```

`FeedSidebar({ ... })` の destructuring にも `selectedCategory`, `onSelectCategory`, `onCategoryRenamed` を追加。

- [ ] **Step 2: 「すべて」のハイライト条件を修正**

[src/components/feeds/FeedSidebar.tsx:194-206](src/components/feeds/FeedSidebar.tsx#L194-L206) の `すべて` ボタンの `style` を変更:

```tsx
<button
  onClick={() => onSelect(null)}
  className="flex w-full items-center justify-between rounded px-2 py-1"
  style={{
    background:
      view === "feeds" && selectedFeedId === null && selectedCategory === null
        ? "var(--accent-subtle)"
        : "transparent",
  }}
>
```

- [ ] **Step 3: renameCategory が onCategoryRenamed を発火するように変更**

[src/components/feeds/FeedSidebar.tsx:121-129](src/components/feeds/FeedSidebar.tsx#L121-L129) を以下に置換:

```ts
async function renameCategory(oldName: string, newName: string) {
  const trimmed = newName.trim();
  if (oldName === trimmed || !trimmed) return;
  const res = await fetch("/api/categories", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ oldName, newName: trimmed }),
  });
  if (res.ok) {
    onFeedMoved?.();
    onCategoryRenamed?.(oldName, trimmed);
  }
}
```

- [ ] **Step 4: CategoryGroup にカテゴリ選択 UI を組み込み**

[src/components/feeds/FeedSidebar.tsx:288-465](src/components/feeds/FeedSidebar.tsx#L288-L465) の `CategoryGroup` を再構築する。Props と中身を以下に置換:

```tsx
function CategoryGroup({
  category,
  feeds,
  selectedFeedId,
  selectedCategory,
  onSelect,
  onSelectCategory,
  dragFeedId,
  onDragStart,
  onDrop,
  onRename,
  selectMode,
  selectedIds,
  onToggleFeed,
  onToggleCategory,
}: {
  category: string;
  feeds: FeedWithUnread[];
  selectedFeedId: string | null;
  selectedCategory: string | null;
  onSelect: (id: string | null) => void;
  onSelectCategory: (category: string) => void;
  dragFeedId: string | null;
  onDragStart: (id: string | null) => void;
  onDrop: (feedId: string, category: string) => void;
  onRename: (oldName: string, newName: string) => void;
  selectMode: boolean;
  selectedIds: Set<string>;
  onToggleFeed: (id: string) => void;
  onToggleCategory: (category: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const [dropTarget, setDropTarget] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(category);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const catAllChecked = selectMode && feeds.every((f) => selectedIds.has(f.id));
  const catSomeChecked = selectMode && !catAllChecked && feeds.some((f) => selectedIds.has(f.id));
  const unreadTotal = feeds.reduce((n, f) => n + (f.unreadCount ?? 0), 0);
  const isSelected = !selectMode && selectedCategory === category;

  function handleDragOver(e: React.DragEvent) {
    if (selectMode) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDropTarget(true);
  }

  function handleDragLeave() {
    setDropTarget(false);
  }

  function handleDrop(e: React.DragEvent) {
    if (selectMode) return;
    e.preventDefault();
    setDropTarget(false);
    if (dragFeedId) {
      onDrop(dragFeedId, category);
      onDragStart(null);
    }
  }

  function commitRename() {
    setEditing(false);
    if (editValue.trim() && editValue.trim() !== category) {
      onRename(category, editValue.trim());
    } else {
      setEditValue(category);
    }
  }

  return (
    <div
      className="group/cat mt-3 rounded border-t pt-2 transition-colors"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{
        background: dropTarget
          ? "var(--accent-subtle)"
          : isSelected
            ? "var(--accent-subtle)"
            : "transparent",
        outline: dropTarget ? "2px dashed var(--accent)" : "none",
        outlineOffset: "-2px",
        borderColor: "var(--card-border)",
      }}
    >
      {selectMode ? (
        <label className="flex cursor-pointer items-center gap-2 px-2 text-xs uppercase" style={{ color: "var(--muted)" }}>
          <input
            type="checkbox"
            checked={catAllChecked}
            ref={(el) => { if (el) el.indeterminate = catSomeChecked; }}
            onChange={() => onToggleCategory(category)}
            className="h-3.5 w-3.5"
          />
          <span>{category}</span>
        </label>
      ) : editing ? (
        <input
          ref={inputRef}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitRename();
            if (e.key === "Escape") { setEditValue(category); setEditing(false); }
          }}
          className="mx-2 w-[calc(100%-16px)] rounded border px-1 py-0.5 text-xs"
          style={{ borderColor: "var(--accent)", background: "var(--card)" }}
        />
      ) : (
        <div className="flex items-center px-2 text-xs uppercase" style={{ color: "var(--muted)" }}>
          <button
            onClick={() => onSelectCategory(category)}
            className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
            title="クリックでカテゴリ全体を表示"
          >
            <span className="truncate">{category}</span>
            {unreadTotal > 0 && (
              <span className="shrink-0 normal-case" style={{ color: "var(--muted)" }}>
                {unreadTotal}
              </span>
            )}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setEditing(true); }}
            className="ml-1 shrink-0 rounded px-1 opacity-0 transition-opacity group-hover/cat:opacity-100"
            title="名前を変更"
            aria-label="カテゴリ名を変更"
          >
            ✎
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
            className="ml-1 shrink-0 rounded px-1"
            aria-label={open ? "折りたたむ" : "展開する"}
          >
            {open ? "▾" : "▸"}
          </button>
        </div>
      )}
      {(open || selectMode) && (
        <div className="mt-1">
          {feeds.map((f) => {
            const checked = selectedIds.has(f.id);
            return (
              <button
                key={f.id}
                draggable={!selectMode}
                onDragStart={(e) => {
                  if (selectMode) return;
                  onDragStart(f.id);
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", f.id);
                }}
                onDragEnd={() => onDragStart(null)}
                onClick={() => (selectMode ? onToggleFeed(f.id) : onSelect(f.id))}
                className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left ${
                  selectMode ? "cursor-pointer" : "cursor-grab active:cursor-grabbing"
                }`}
                style={{
                  background:
                    selectMode && checked
                      ? "var(--accent-subtle)"
                      : !selectMode && selectedFeedId === f.id
                        ? "var(--accent-subtle)"
                        : "transparent",
                }}
              >
                {selectMode ? (
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggleFeed(f.id)}
                    onClick={(e) => e.stopPropagation()}
                    className="h-3.5 w-3.5 shrink-0"
                  />
                ) : (
                  <FeedIcon url={f.faviconUrl} title={f.title} />
                )}
                <span className="min-w-0 flex-1 truncate">{f.title}</span>
                {!selectMode && f.consecutiveFetchFailures >= 3 && (
                  <span className="shrink-0 text-xs text-yellow-500" title="取得失敗">⚠</span>
                )}
                {!selectMode && f.unreadCount > 0 && (
                  <span className="shrink-0 text-xs" style={{ color: "var(--muted)" }}>
                    {f.unreadCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

主な変更点:
- カテゴリヘッダを「名前ボタン / ペンシルボタン / 開閉ボタン」に分割
- 名前ボタンのクリックで `onSelectCategory(category)` 発火
- 編集はホバー時に出る `✎` ボタンに移行（double-click では発動しない）
- 選択中ハイライト（`isSelected`）と未読数表示
- 「すべて」「お気に入り」「いいね」と同じく `selectMode` 中はカテゴリフィルタを無効

`CategoryGroup` 呼び出し元 [src/components/feeds/FeedSidebar.tsx:235-251](src/components/feeds/FeedSidebar.tsx#L235-L251) にも以下のプロップを追加:

```tsx
<CategoryGroup
  key={cat}
  category={cat}
  feeds={grouped[cat]!}
  selectedFeedId={selectedFeedId}
  selectedCategory={selectedCategory}
  onSelect={onSelect}
  onSelectCategory={onSelectCategory}
  dragFeedId={dragFeedId}
  onDragStart={setDragFeedId}
  onDrop={moveFeedToCategory}
  onRename={renameCategory}
  selectMode={selectMode}
  selectedIds={selectedIds}
  onToggleFeed={toggleOne}
  onToggleCategory={toggleCategory}
/>
```

- [ ] **Step 5: 型チェック**

```bash
pnpm typecheck
```
期待: page.tsx 側で「`selectedCategory` プロップが不足」というエラーが出る（Task 5 で解消）

- [ ] **Step 6: 中間コミット**

```bash
git add src/components/feeds/FeedSidebar.tsx
git commit -m "FeedSidebar にカテゴリ選択 UI 追加"
```

---

## Task 5: page.tsx に selectedCategory state を統合

**Files:**
- Modify: `src/app/feeds/page.tsx`

- [ ] **Step 1: state と排他クリアハンドラを追加**

[src/app/feeds/page.tsx:18-22](src/app/feeds/page.tsx#L18-L22) 近辺の state 宣言群の中、`selectedFeedId` の直後に追加:

```tsx
const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
```

- [ ] **Step 2: loadArticles でカテゴリを送る**

[src/app/feeds/page.tsx:84-96](src/app/feeds/page.tsx#L84-L96) の `loadArticles` を以下に置換:

```ts
const loadArticles = useCallback(async () => {
  const params = new URLSearchParams();
  if (selectedFeedId) params.set("feedId", selectedFeedId);
  else if (selectedCategory) params.set("category", selectedCategory);
  if (search) params.set("search", search);
  if (view === "starred") params.set("isStarred", "true");
  const res = await fetch(`/api/articles?${params}`);
  if (res.status === 401) {
    router.replace("/login");
    return;
  }
  const data = await res.json();
  setArticles(data.articles);
}, [selectedFeedId, selectedCategory, search, view, router]);
```

- [ ] **Step 3: markAllRead でカテゴリを送る**

[src/app/feeds/page.tsx:172-186](src/app/feeds/page.tsx#L172-L186) の `markAllRead` を以下に置換:

```ts
async function markAllRead() {
  setMarkingRead(true);
  const body: Record<string, string> = {};
  if (selectedFeedId) body.feedId = selectedFeedId;
  else if (selectedCategory) body.category = selectedCategory;
  const res = await fetch("/api/articles/mark-all-read", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  setMarkingRead(false);
  if (res.ok) {
    loadArticles();
    loadFeeds();
  }
}
```

- [ ] **Step 4: FeedSidebar への props 受け渡しを修正**

[src/app/feeds/page.tsx:234-267](src/app/feeds/page.tsx#L234-L267) の `<FeedSidebar ...>` 呼び出しを以下に置換:

```tsx
<FeedSidebar
  feeds={feeds}
  selectedFeedId={selectedFeedId}
  selectedCategory={selectedCategory}
  onSelect={(id) => {
    setView("feeds");
    setSelectedFeedId(id);
    setSelectedCategory(null);
    setSelected(null);
    if (isMobile) goToMobileView("list");
  }}
  onSelectCategory={(category) => {
    setView("feeds");
    setSelectedFeedId(null);
    setSelectedCategory(category);
    setSelected(null);
    if (isMobile) goToMobileView("list");
  }}
  onAddFeed={() => setAddOpen(true)}
  onSync={sync}
  syncing={syncing}
  onLogout={logout}
  onFeedMoved={loadFeeds}
  onFeedsDeleted={() => {
    loadFeeds();
    loadArticles();
    setSelected(null);
    setSelectedFeedId(null);
    setSelectedCategory(null);
  }}
  onCategoryRenamed={(oldName, newName) => {
    setSelectedCategory((cur) => (cur === oldName ? newName : cur));
  }}
  isMobile={isMobile}
  view={view}
  onSelectLikes={() => {
    setView("likes");
    setSelectedFeedId(null);
    setSelectedCategory(null);
    setSelected(null);
    if (isMobile) goToMobileView("list");
  }}
  onSelectStarred={() => {
    setView("starred");
    setSelectedFeedId(null);
    setSelectedCategory(null);
    setSelected(null);
    if (isMobile) goToMobileView("list");
  }}
/>
```

- [ ] **Step 5: 空カテゴリ同期 useEffect を追加**

[src/app/feeds/page.tsx:98-104](src/app/feeds/page.tsx#L98-L104) の `useEffect(() => { loadFeeds(); }, [loadFeeds])` の直後に追加:

```tsx
useEffect(() => {
  if (selectedCategory === null) return;
  const exists = feeds.some((f) => f.category === selectedCategory);
  if (!exists) setSelectedCategory(null);
}, [feeds, selectedCategory]);
```

- [ ] **Step 6: 型チェックと build sanity**

```bash
pnpm typecheck
```
期待: エラーなし

- [ ] **Step 7: コミット**

```bash
git add src/app/feeds/page.tsx
git commit -m "page.tsx に selectedCategory を統合"
```

---

## Task 6: テストスイート全体実行 & EXPLAIN QUERY PLAN 検証

**Files:**
- なし（検証のみ）

- [ ] **Step 1: 全テスト実行**

```bash
pnpm test
```
期待: すべてのテストが PASS

- [ ] **Step 2: 型 + lint**

```bash
pnpm typecheck
pnpm lint
```
期待: エラーなし

- [ ] **Step 3: EXPLAIN QUERY PLAN を手動確認**

開発用 SQLite で以下を実行:

```bash
sqlite3 data/yomu.db <<'SQL'
EXPLAIN QUERY PLAN
SELECT a.*, f.title AS feed_title FROM articles a LEFT JOIN feeds f ON f.id = a.feed_id
WHERE a.feed_id IN (SELECT id FROM feeds WHERE category = 'BLOG')
ORDER BY a.sort_key DESC, a.id DESC LIMIT 51;

EXPLAIN QUERY PLAN
SELECT COUNT(*) FROM articles a
WHERE a.feed_id IN (SELECT id FROM feeds WHERE category = 'BLOG');
SQL
```

期待: 出力に `USING INDEX idx_feeds_category` が含まれる、または `USING INDEX idx_articles_feed_sort` 等の articles 側 index が使われる。少なくとも `SCAN articles` 全件スキャンが ORDER BY 込みの list クエリで観測されないこと。

実機データが入っていない場合は本ステップは skip 可だが、production DB に上げる前に必ず一度確認すること。

- [ ] **Step 4: 開発サーバで動作確認**

```bash
pnpm dev
```

ブラウザで `http://localhost:3000/feeds` を開き、以下を順に確認:
- 「BLOG」カテゴリ名をクリック → 該当フィードの記事のみ表示される
- 「すべて」ボタン背景がカテゴリ選択時にハイライトされていない
- カテゴリヘッダの ▾ / ▸ で展開折りたたみが従来通り動く
- カテゴリヘッダにホバーすると ✎ アイコンが現れ、クリックでリネーム入力に切り替わる
- カテゴリ選択中の「全て既読」ボタンでそのカテゴリの記事のみ既読化される（DB 確認推奨）
- カテゴリ名をリネームした際、選択状態が新名に追随する
- カテゴリ内の全フィードを別カテゴリへ移動 → 選択が自動でクリアされ「すべて」表示に戻る
- モバイル幅（DevTools で 375px など）でカテゴリ選択 → リストビューに遷移する

何か壊れていれば該当 Task に戻って修正する。

- [ ] **Step 5: 動作確認完了の最終コミット（必要時）**

検証で見つかった微調整があれば修正して:

```bash
git add -A
git commit -m "カテゴリ別記事表示の動作確認後の修正"
```

---

## Self-Review チェックリスト

- [x] Spec の各セクションが Task で実装されている（category クエリ追加 = T1/T2、mark-all-read = T3、UI = T4、状態統合 = T5、検証 = T6）
- [x] プレースホルダなし
- [x] 型整合性: `onSelectCategory`, `onCategoryRenamed`, `selectedCategory` の名前と署名は Task 4/5 で一致
- [x] `validateMarkAllReadInput` / `markAllRead` / `MarkAllReadScope` の型名も Task 3 内で一貫
