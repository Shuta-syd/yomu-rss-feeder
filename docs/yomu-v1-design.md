# Yomu RSS Feeder — Engineering Design Document v1.0

**Version:** 1.0.3
**Last Updated:** 2026-04-11
**Status:** Final — 4thレビュー反映済み、実装着手可

---

## 0. v1 スコープ宣言

### やること

- シングルユーザーのセルフホストRSSリーダー
- LLMによる記事の1行サマリー・タグ付け（バックグラウンド）
- LLMによる記事の要約・翻訳（ユーザーが明示的にトリガー、オンデマンド）
- ライト/ダークテーマ
- 既読/未読・スター管理

### やらないこと（v1.1以降）

- Xいいね分析（v1.1）
- AI Insights・横断分析（v2）
- マルチユーザー・認証（v2）
- LLMマルチプロバイダ抽象化（v2。v1はGemini固定）
- PWAオフラインサポート（v2）
- OPMLエクスポート（v1.1）

### なぜRSSだけに絞るか

RSSリーダーとXいいね分析を統合する価値は「横断分析」にある。しかし横断分析はv1スコープ外である。横断分析なしでXいいねを入れても「同居しているだけ」のプロダクトになり、焦点がぼやける。v1はRSSリーダーとしての完成度を最優先する。

---

## 1. 技術スタック

| 技術 | バージョン | 用途 |
|------|-----------|------|
| Node.js | >= 22.x LTS | ランタイム |
| Next.js | 16.2.x (App Router) | フレームワーク |
| React | 19.x | UI |
| TypeScript | 5.7.x | 型安全 |
| SQLite | 3.45+ (WALモード) | DB |
| better-sqlite3 | ^11.x | SQLiteドライバ |
| Drizzle ORM | ^0.39.x | ORM |
| drizzle-kit | ^0.30.x | マイグレーション |
| Tailwind CSS | 4.x | スタイリング |
| shadcn/ui | latest | UIコンポーネント |
| next-themes | ^0.4.x | テーマ切替 |
| rss-parser | ^3.x | RSSパース |
| node-cron | ^3.x | 定期フィード取得 |
| DOMPurify + jsdom | ^3.x | HTMLサニタイズ |
| pnpm | >= 9.x | パッケージマネージャ |
| Vitest | ^3.x | テスト |
| Docker / Compose | >= 27.x / 2.30.x | コンテナ化 |

### 採用しないもの（v1）

| 技術 | 理由 |
|------|------|
| Redis / BullMQ | シングルユーザーにジョブキューは過剰。node-cronのインプロセス実行で十分 |
| Auth.js | シングルユーザー。初回セットアップ時にパスワード設定、以降はセッションcookieのみ |
| LLM抽象化レイヤー | v1はGemini固定。抽象化コストの方が高い |
| Playwright | v1ではVitestのunit/integrationテストに集中 |

---

## 2. プロジェクト構成

```
yomu/
├── docker-compose.yml
├── Dockerfile
├── entrypoint.sh                   # 起動シーケンス（migration → stale reset → server）
├── drizzle.config.ts
├── next.config.ts
├── package.json
├── tsconfig.json
├── .env.example
│
├── drizzle/                        # マイグレーション（自動生成）
│
├── src/
│   ├── instrumentation.ts          # cron初期化（Next.js bootstrap hook）
│   ├── app/
│   │   ├── layout.tsx              # ルートレイアウト（テーマ）
│   │   ├── page.tsx                # → /feeds リダイレクト
│   │   ├── setup/page.tsx          # 初回セットアップ（パスワード設定）
│   │   ├── login/page.tsx          # ログイン
│   │   ├── feeds/
│   │   │   ├── layout.tsx          # 3カラムレイアウト
│   │   │   └── page.tsx            # RSS記事一覧
│   │   ├── settings/page.tsx       # 設定
│   │   └── api/
│   │       ├── auth/
│   │       │   ├── login/route.ts
│   │       │   └── logout/route.ts
│   │       ├── setup/route.ts      # 初回パスワード設定
│   │       ├── feeds/
│   │       │   ├── route.ts        # GET一覧, POST追加
│   │       │   ├── [id]/route.ts   # PUT更新, DELETE削除
│   │       │   └── import/route.ts # POST OPMLインポート
│   │       ├── articles/
│   │       │   ├── route.ts        # GET一覧（cursor pagination）
│   │       │   ├── [id]/route.ts   # GET詳細, PATCH既読/スター
│   │       │   ├── [id]/ai/route.ts # POST AI処理（同期、結果を直接返す）
│   │       │   ├── mark-read/route.ts
│   │       │   └── mark-all-read/route.ts
│   │       ├── settings/route.ts
│   │       └── sync/route.ts       # POST 手動フィード更新
│   │
│   ├── components/
│   │   ├── layout/
│   │   │   ├── AppShell.tsx        # サイドバー+ツールバー+ステータスバー
│   │   │   └── ThemeToggle.tsx
│   │   ├── feeds/
│   │   │   ├── FeedSidebar.tsx
│   │   │   ├── FeedCategoryGroup.tsx
│   │   │   └── AddFeedDialog.tsx
│   │   ├── articles/
│   │   │   ├── ArticleList.tsx
│   │   │   ├── ArticleListItem.tsx
│   │   │   ├── ArticleDetail.tsx
│   │   │   ├── AISummaryCard.tsx
│   │   │   └── AITranslationCard.tsx
│   │   └── ui/                     # shadcn/ui
│   │
│   ├── lib/
│   │   ├── db/
│   │   │   ├── index.ts            # DBインスタンス（WALモード有効化）
│   │   │   ├── schema.ts           # Drizzleスキーマ
│   │   │   ├── indexes.ts          # インデックス定義
│   │   │   └── seed.ts             # 初期データ
│   │   ├── rss/
│   │   │   ├── fetcher.ts          # フィード取得+エラーハンドリング
│   │   │   ├── dedup.ts            # 重複判定ロジック
│   │   │   ├── sync-lock.ts        # 同期ロック（二重実行防止）
│   │   │   └── opml.ts             # OPMLパース
│   │   ├── llm/
│   │   │   ├── gemini.ts           # Gemini APIクライアント（v1固定）
│   │   │   ├── prompts.ts          # プロンプト定義
│   │   │   └── parse-response.ts   # JSONパース+修復+バリデーション
│   │   ├── sanitize.ts             # HTMLサニタイズ設定
│   │   ├── auth.ts                 # シンプル認証（bcrypt+session cookie）
│   │   ├── cron.ts                 # フィード定期取得+Stage1処理
│   │   └── crypto.ts               # APIキー暗号化
│   │
│   ├── hooks/
│   │   ├── use-articles.ts
│   │   └── use-feeds.ts
│   │
│   └── types/
│       ├── feed.ts
│       └── article.ts
│
└── __tests__/
    ├── lib/
    │   ├── rss/fetcher.test.ts      # フィード取得テスト
    │   ├── rss/dedup.test.ts        # 重複判定テスト
    │   ├── llm/parse-response.test.ts # JSONパース修復テスト
    │   └── sanitize.test.ts         # サニタイズテスト
    └── api/
        ├── articles.test.ts
        └── feeds.test.ts
```

---

## 3. データベース設計

### 3.1 SQLite設定

```typescript
// src/lib/db/index.ts
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

const sqlite = new Database("data/yomu.db");

// WALモード有効化（並行読み取り性能向上、書き込み耐障害性向上）
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("busy_timeout = 5000");
sqlite.pragma("synchronous = NORMAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });
```

### 3.2 時刻フォーマットの統一

**全時刻カラムは integer（Unix epoch ミリ秒）で統一する。** SQLiteの `datetime()` 関数は使わない。

理由:
- text型のISO 8601とSQLiteの `datetime()` の出力形式が微妙に異なり、比較演算が壊れやすい
- cursor pagination で `publishedAt` を使うため、バイナリ比較で正しくソートされる必要がある
- integer なら `>`, `<` で正確に比較でき、インデックスも効く

```typescript
// src/lib/db/helpers.ts
export function now(): number {
  return Date.now();
}
```

### 3.3 スキーマ

```typescript
// src/lib/db/schema.ts
import { sqliteTable, text, integer, uniqueIndex, index } from "drizzle-orm/sqlite-core";

// ─── App Config（シングルユーザー）───
export const appConfig = sqliteTable("app_config", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});
// 格納するキー:
//   "password_hash"        - bcryptハッシュ
//   "setup_completed"      - "true" | "false"
//   "gemini_api_key"       - 暗号化済み
//   "gemini_model_stage1"  - デフォルト "gemini-2.5-flash-lite"
//   "gemini_model_stage2"  - デフォルト "gemini-3-flash"
//   "theme"                - "light" | "dark" | "system"
//   "auto_mark_as_read"    - "true" | "false"
//   "session_hash"         - セッショントークンのSHA-256
//   "session_expires_at"   - integer epoch ms
//   "sync_lock"            - integer epoch ms（ロック取得時刻）

// ─── Feeds ───
export const feeds = sqliteTable("feeds", {
  id: text("id").primaryKey(),                      // UUID v7
  title: text("title").notNull(),
  url: text("url").notNull().unique(),              // フィードURL（重複登録防止）
  siteUrl: text("site_url"),
  description: text("description"),
  faviconUrl: text("favicon_url"),
  category: text("category").notNull().default("未分類"),

  // 取得間隔: このフィード固有の最小取得間隔（分）
  // cron は全フィードを巡回し、各フィードの lastFetchedAt + fetchIntervalMin が
  // 現在時刻を超えていればスキップする
  fetchIntervalMin: integer("fetch_interval_min").notNull().default(30),

  lastFetchedAt: integer("last_fetched_at"),        // epoch ms
  lastFetchStatus: text("last_fetch_status").notNull().default("pending"),
  // "ok" | "error" | "pending"
  lastFetchError: text("last_fetch_error"),
  consecutiveFetchFailures: integer("consecutive_fetch_failures").notNull().default(0),
  // 3回以上でUIに警告バッジ表示。成功時に0リセット

  createdAt: integer("created_at").notNull().$defaultFn(() => Date.now()),
}, (table) => [
  index("idx_feeds_category").on(table.category),
]);

// ─── Articles ───
export const articles = sqliteTable("articles", {
  id: text("id").primaryKey(),                      // UUID v7
  feedId: text("feed_id").notNull().references(() => feeds.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  url: text("url").notNull(),
  author: text("author"),
  contentHtml: text("content_html"),                // サニタイズ済みHTML（表示用）
  contentPlain: text("content_plain"),              // プレーンテキスト（AI入力用）
  publishedAt: integer("published_at"),             // epoch ms（RSSから取得、nullable）
  // ソート専用: publishedAt があればそれ、なければ createdAt を使う（非null保証）
  sortKey: integer("sort_key").notNull(),            // epoch ms
  detectedLanguage: text("detected_language"),       // "en" | "ja" | etc.

  // 重複判定キー（後述の dedup 戦略を参照）
  dedupHash: text("dedup_hash").notNull(),           // SHA-256(feedId + guid || url || title+publishedAt)

  // 既読/スター
  isRead: integer("is_read", { mode: "boolean" }).notNull().default(false),
  isStarred: integer("is_starred", { mode: "boolean" }).notNull().default(false),
  readAt: integer("read_at"),                        // epoch ms

  // AI Stage 1（バックグラウンド、全記事）
  aiSummaryShort: text("ai_summary_short"),          // 1行サマリー（日本語）
  aiTags: text("ai_tags"),                           // JSON: ["AI", "LLM"]
  aiStage1Status: text("ai_stage1_status").notNull().default("pending"),
  // "pending" | "processing" | "done" | "failed" | "skipped"
  aiStage1Error: text("ai_stage1_error"),
  aiStage1ProcessedAt: integer("ai_stage1_processed_at"),

  // AI Stage 2（オンデマンド、ユーザーが明示的にトリガー）
  aiSummaryFull: text("ai_summary_full"),            // 3-5文の要約（日本語）
  aiTranslation: text("ai_translation"),             // 取得済み本文の日本語翻訳
  aiKeyPoints: text("ai_key_points"),                // JSON: ["point1", "point2"]
  aiStage2Status: text("ai_stage2_status").notNull().default("none"),
  // "none" | "processing" | "done" | "failed"
  aiStage2Error: text("ai_stage2_error"),
  aiStage2ProcessedAt: integer("ai_stage2_processed_at"),

  createdAt: integer("created_at").notNull().$defaultFn(() => Date.now()),
}, (table) => [
  uniqueIndex("idx_articles_dedup").on(table.feedId, table.dedupHash),
  // cursor pagination 用: ソート順 (sortKey DESC, id DESC) と一致させる
  index("idx_articles_sort").on(table.sortKey, table.id),
  // フィード絞り込み + cursor pagination 用
  index("idx_articles_feed_sort").on(table.feedId, table.sortKey, table.id),
  index("idx_articles_is_read").on(table.isRead),
  index("idx_articles_is_starred").on(table.isStarred),
]);
```

### 3.4 全文検索（FTS5）

マイグレーションで手動作成。INSERT / UPDATE / DELETE の3トリガーを定義。

```sql
CREATE VIRTUAL TABLE IF NOT EXISTS articles_fts USING fts5(
  title,
  content_plain,
  ai_summary_short,
  ai_summary_full,
  ai_translation,
  content='articles',
  content_rowid='rowid'
);

-- INSERT トリガー
CREATE TRIGGER IF NOT EXISTS articles_fts_insert AFTER INSERT ON articles BEGIN
  INSERT INTO articles_fts(rowid, title, content_plain, ai_summary_short, ai_summary_full, ai_translation)
  VALUES (new.rowid, new.title, new.content_plain, new.ai_summary_short, new.ai_summary_full, new.ai_translation);
END;

-- UPDATE トリガー
CREATE TRIGGER IF NOT EXISTS articles_fts_update AFTER UPDATE ON articles BEGIN
  INSERT INTO articles_fts(articles_fts, rowid, title, content_plain, ai_summary_short, ai_summary_full, ai_translation)
  VALUES ('delete', old.rowid, old.title, old.content_plain, old.ai_summary_short, old.ai_summary_full, old.ai_translation);
  INSERT INTO articles_fts(rowid, title, content_plain, ai_summary_short, ai_summary_full, ai_translation)
  VALUES (new.rowid, new.title, new.content_plain, new.ai_summary_short, new.ai_summary_full, new.ai_translation);
END;

-- DELETE トリガー
CREATE TRIGGER IF NOT EXISTS articles_fts_delete AFTER DELETE ON articles BEGIN
  INSERT INTO articles_fts(articles_fts, rowid, title, content_plain, ai_summary_short, ai_summary_full, ai_translation)
  VALUES ('delete', old.rowid, old.title, old.content_plain, old.ai_summary_short, old.ai_summary_full, old.ai_translation);
END;
```

### 3.4 未読カウント

カウンタカラムは持たない。クエリ時に都度集計する。

```sql
SELECT f.id, f.title, COUNT(a.id) FILTER (WHERE a.is_read = 0) AS unread_count
FROM feeds f
LEFT JOIN articles a ON a.feed_id = f.id
GROUP BY f.id;
```

理由: シングルユーザー＋SQLiteのデータ量（数万件程度）なら、整合性を壊すカウンタを持つリスクの方が高い。パフォーマンスが問題になったらその時にキャッシュを導入する。

### 3.5 記事重複判定（dedup戦略）

RSSの `guid` は信頼できないフィードが存在する。以下の優先順位でハッシュを生成する。

```typescript
// src/lib/rss/dedup.ts
import { createHash } from "crypto";

export function computeDedupHash(feedId: string, item: RSSItem): string {
  // 優先順位: guid > url > (title + publishedAt)
  let source: string;

  if (item.guid && item.guid.trim() !== "") {
    source = item.guid.trim();
  } else if (item.link && item.link.trim() !== "") {
    source = normalizeUrl(item.link.trim());
  } else {
    // 最終手段: タイトルと日付の組み合わせ
    source = `${(item.title || "").trim()}::${(item.pubDate || "").trim()}`;
  }

  return createHash("sha256").update(`${feedId}:${source}`).digest("hex").slice(0, 32);
}

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    // トラッキングパラメータ除去
    ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"].forEach(
      p => u.searchParams.delete(p)
    );
    return u.toString();
  } catch {
    return url;
  }
}
```

INSERT時に `(feedId, dedupHash)` のuniqueIndex制約で重複を弾く。`INSERT ... ON CONFLICT DO NOTHING` を使用。

### 3.6 バックアップ戦略

```bash
#!/bin/bash
# backup.sh — cronで日次実行
BACKUP_DIR="/app/data/backups"
DB_PATH="/app/data/yomu.db"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
mkdir -p "$BACKUP_DIR"

# SQLite online backup（WALモード対応、ロック不要）
sqlite3 "$DB_PATH" ".backup '${BACKUP_DIR}/yomu_${TIMESTAMP}.db'"

# 7日分保持、古いものを削除
find "$BACKUP_DIR" -name "yomu_*.db" -mtime +7 -delete
```

Docker Compose にcronコンテナを追加するか、ホスト側のcronで実行する。

**重要: バックアップ対象は `yomu.db` だけではない。** DB内のGemini APIキー等は `ENCRYPTION_KEY` で暗号化されている。鍵を失うと、DBを復元しても暗号化済みの設定値は復号できない。`ENCRYPTION_KEY` は DB とは別の安全な場所（パスワードマネージャ等）にも保管すること。

---

## 4. API設計

### 4.1 認証

シングルユーザー。初回セットアップ時にパスワードをbcryptハッシュ化して `app_config` に保存。ログイン時にセッションcookie（httpOnly, secure, sameSite=strict）を発行。

**設計方針**:
- セッションは1本のみ。別ブラウザでログインすると前のセッションは失効する（シングルユーザーのため問題なし）
- DBにはセッショントークンの**SHA-256ハッシュ**を保存（生トークンは保存しない）
- セッションには有効期限（30日）を設定し、DB側でも `session_expires_at` を持つ
- `/api/setup` と `/api/auth/login` にはレート制限を適用（1分あたり5回）

```typescript
// src/lib/auth.ts
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { randomBytes, createHash } from "crypto";
import { db } from "./db";
import { appConfig } from "./db/schema";
import { eq } from "drizzle-orm";

const SESSION_COOKIE = "yomu_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30日

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function login(password: string): Promise<boolean> {
  const row = db.select().from(appConfig).where(eq(appConfig.key, "password_hash")).get();
  if (!row) return false;
  const valid = await bcrypt.compare(password, row.value);
  if (!valid) return false;

  const token = randomBytes(32).toString("hex");
  const tokenHash = hashToken(token);
  const expiresAt = Date.now() + SESSION_MAX_AGE * 1000;  // epoch ms

  // セッションハッシュと有効期限を保存（前のセッションは上書きされて失効）
  db.insert(appConfig).values({ key: "session_hash", value: tokenHash })
    .onConflictDoUpdate({ target: appConfig.key, set: { value: tokenHash } }).run();
  db.insert(appConfig).values({ key: "session_expires_at", value: String(expiresAt) })
    .onConflictDoUpdate({ target: appConfig.key, set: { value: String(expiresAt) } }).run();

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: SESSION_MAX_AGE,
    path: "/",
  });
  return true;
}

export async function requireAuth(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) throw new Response("Unauthorized", { status: 401 });

  const hashRow = db.select().from(appConfig).where(eq(appConfig.key, "session_hash")).get();
  const expiresRow = db.select().from(appConfig).where(eq(appConfig.key, "session_expires_at")).get();

  if (!hashRow || hashRow.value !== hashToken(token)) {
    throw new Response("Unauthorized", { status: 401 });
  }
  if (expiresRow && Number(expiresRow.value) < Date.now()) {
    throw new Response("Session expired", { status: 401 });
  }
}

// レート制限（/api/setup, /api/auth/login 用）
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(key: string, maxPerMinute = 5): void {
  // key は "route:clientIP" の形式で呼び出す（例: "login:192.168.1.1"）
  // Caddy 経由の場合、X-Forwarded-For から client IP を取得する
  const now = Date.now();
  const entry = rateLimitMap.get(key);
  if (!entry || entry.resetAt < now) {
    rateLimitMap.set(key, { count: 1, resetAt: now + 60_000 });
    return;
  }
  entry.count++;
  if (entry.count > maxPerMinute) {
    throw new Response("Too many requests", { status: 429 });
  }
}
```

### 4.2 エンドポイント一覧

**認証ポリシー: 以下の例外を除き、全APIエンドポイントで `requireAuth()` を呼ぶ（GET含む）。**

認証不要のエンドポイント（ホワイトリスト）:
- `GET /api/setup` — セットアップ状態確認
- `POST /api/setup` — 初回パスワード設定（レート制限あり）
- `POST /api/auth/login` — ログイン（レート制限あり）

それ以外の全 GET / POST / PUT / PATCH / DELETE は認証必須。「ページで保護しているからAPIは不要」という設計にしない。

#### Setup / Auth

| Method | Path | 概要 | Request | Response |
|--------|------|------|---------|----------|
| GET | `/api/setup` | セットアップ状態確認 | — | `{ completed: boolean }` |
| POST | `/api/setup` | 初回パスワード設定 | `{ password }` | `200` or `409`(設定済み) |
| POST | `/api/auth/login` | ログイン | `{ password }` | `200` or `401` |
| POST | `/api/auth/logout` | ログアウト | — | `200` |

`POST /api/auth/logout` の挙動: `app_config` から `session_hash` と `session_expires_at` を削除し、セッションcookieを `maxAge=0` で上書きして消去する。

#### Feeds

| Method | Path | 概要 | Request | Response |
|--------|------|------|---------|----------|
| GET | `/api/feeds` | フィード一覧（未読数付き） | — | `FeedWithUnread[]` |
| POST | `/api/feeds` | フィード追加 | `{ url, category? }` | `Feed` or `409`(重複) or `422`(パース失敗) |
| PUT | `/api/feeds/:id` | フィード更新 | `{ title?, category?, fetchIntervalMin? }` | `Feed` |
| DELETE | `/api/feeds/:id` | フィード削除（記事もcascade） | — | `204` |
| POST | `/api/feeds/import` | OPMLインポート | `FormData { file }` | `{ imported, skipped, errors[] }` |
| POST | `/api/sync` | 手動フィードリフレッシュ | `{ feedId? }` | `{ updated, newArticles, errors[] }` |

フィード追加時の処理:
1. URLにアクセスしてRSSパース可能か検証
2. パース失敗 → `422` でエラー詳細返却
3. 同一URL既存 → `409`
4. 成功 → フィード保存 + 即座に初回フェッチ実行

#### Articles

| Method | Path | 概要 | Query/Body | Response |
|--------|------|------|-----------|----------|
| GET | `/api/articles` | 記事一覧 | `?feedId&isRead&isStarred&search&cursor&limit` | `{ articles[], nextCursor, total }` |
| GET | `/api/articles/:id` | 記事詳細 | — | `Article` |
| PATCH | `/api/articles/:id` | 既読/スター更新 | `{ isRead?, isStarred? }` | `Article` |
| POST | `/api/articles/:id/ai` | Stage2 AI処理 | — | `Article`（処理結果含む） |
| POST | `/api/articles/mark-read` | 一括既読 | `{ articleIds[] }` | `{ updated: number }` |
| POST | `/api/articles/mark-all-read` | 全件既読 | `{ feedId? }` | `{ updated: number }` |

**Cursor Pagination**:
```
GET /api/articles?cursor=1744364520000_01JXYZ&limit=50

Response:
{
  "articles": [...],
  "nextCursor": "1744351500000_01JXYW",  // sortKey_id
  "total": 342
}
```

cursorは `sortKey + "_" + id` の複合値。ページ番号方式は使わない。

**ソート順とインデックスの対応**:
- 一覧のソート順: `sortKey DESC, id DESC`
- 使用するインデックス:
  - フィード指定なし: `idx_articles_sort(sortKey, id)`
  - フィード指定あり: `idx_articles_feed_sort(feedId, sortKey, id)`
- cursorで指定した位置より古い記事を取得する `WHERE (sortKey, id) < (cursor_sortKey, cursor_id)` の形
- `sortKey` は非null保証のため、nullableな `publishedAt` によるソート崩れが起きない

**検索時の並び順**: `search` パラメータ指定時も `sortKey DESC, id DESC`（時系列順）で返す。FTS5の関連度順(rank)は使わない。理由: 関連度は安定したcursorキーにならない。v1では「検索はできるが、並び順は常に時系列」と割り切る。

**`POST /api/articles/:id/ai` の設計判断**:

同期で結果を返す。理由:
- シングルユーザーでジョブキューなし
- Stage2はオンデマンド（ユーザーがボタンを押した時だけ）
- Gemini Flashのレイテンシは2-5秒で、ローディングUIで対応可能
- 処理中は `aiStage2Status = "processing"` にセットし、クライアントはローディング表示

**Stage2 状態遷移**:

```
none ──[ユーザーがボタン押下]──→ processing ──→ done
                                     │
                                     └──→ failed ──[再試行ボタン]──→ processing
done ──[再生成ボタン]──→ processing ──→ done
```

| 現在のstatus | リクエスト時の挙動 |
|-------------|------------------|
| `none` | `processing` に更新 → LLM呼び出し → `done` or `failed` |
| `processing` | `409 Conflict` を返す（「処理中です」） |
| `done` | 再生成を実行。`processing` → LLM呼び出し → `done` or `failed` |
| `failed` | 再試行を実行。`processing` → LLM呼び出し → `done` or `failed` |

**再生成時の旧結果の扱い**:

再生成開始時（`processing` への遷移時）に旧結果は**クリアしない**。理由:
- 再生成が失敗した場合、前回の結果が残っている方がユーザーにとって有益
- UIでは `aiStage2Status` に応じて表示を切り替える:
  - `processing`: 旧結果を薄く表示 + 「更新中...」バッジ
  - `done`: 最新結果を表示
  - `failed`: 旧結果があれば表示 + 「更新失敗。前回の結果を表示中」バッジ

再生成**成功時**に旧結果を上書きする。失敗時は `aiStage2Error` のみ更新し、`aiSummaryFull` 等は前回成功分を保持。

起動時の `processing → none` リセットについて:
- リセットしても旧結果カラムは触らない
- UIは `status=none && aiSummaryFull != null` を「前回結果あり、再生成可能」として表示

```typescript
// POST /api/articles/:id/ai (route.ts 内の擬似コード)
const article = getArticle(id);
if (article.aiStage2Status === "processing") {
  return Response.json({ error: "Already processing" }, { status: 409 });
}
// ステータスを先に更新（連打防止）
updateArticle(id, { aiStage2Status: "processing", aiStage2Error: null });
try {
  const result = await geminiChat(stage2Prompt(article));
  const parsed = parseAndValidate(result.content, stage2Schema);
  updateArticle(id, {
    aiSummaryFull: parsed.summaryFull,
    aiTranslation: parsed.translation,
    aiKeyPoints: JSON.stringify(parsed.keyPoints),
    aiStage2Status: "done",
    aiStage2ProcessedAt: Date.now(),
  });
} catch (e) {
  updateArticle(id, {
    aiStage2Status: "failed",
    aiStage2Error: e instanceof Error ? e.message : String(e),
  });
  return Response.json({ error: "AI processing failed" }, { status: 500 });
}
```

失敗時:
- LLMのレスポンスがJSONとしてパースできない → `parse-response.ts` で修復試行
- 修復不可 → `aiStage2Status = "failed"`, `aiStage2Error` にエラー詳細 → `500` 返却
- クライアントは「再試行」ボタン表示

#### Settings

| Method | Path | 概要 | Body | Response |
|--------|------|------|------|----------|
| GET | `/api/settings` | 設定取得 | — | `Settings` |
| PUT | `/api/settings` | 設定更新 | `Settings` | `Settings` |

**APIキーの扱い**:

GETレスポンスでAPIキーの値は返さない。代わりに `hasGeminiApiKey: boolean` を返す。

```typescript
// GET /api/settings レスポンス例
{
  "hasGeminiApiKey": true,       // キーが設定済みかどうか
  "geminiModelStage1": "gemini-2.5-flash-lite",
  "geminiModelStage2": "gemini-3-flash",
  "theme": "dark",
  "autoMarkAsRead": true
}
```

`feedRefreshIntervalMin` はグローバル設定には置かない。取得間隔は `feeds.fetchIntervalMin`（フィードごと）で制御する。cron の tick 間隔は5分固定（後述の5.2参照）。

PUT時の `geminiApiKey` フィールドの扱い:
- フィールドが存在しない or `null` → 既存のキーを保持（変更なし）
- 空文字 `""` → キーを削除
- 値あり → 暗号化して上書き

これにより、GETした値をそのままPUTしてもキーが消えない。マスク値 `"****"` を返す方式は採用しない（PUT時の誤上書き事故を防止）。

---

## 5. RSSフィード取得

### 5.1 同期ロック

定期取得（cron）と手動同期（`/api/sync`）の二重実行を防止する。**単一コンテナ（single instance）前提の設計。** 複数replicaでは `app_config` のロックが競合するため、スケールアウト時は別の排他機構が必要。

```typescript
// src/lib/rss/sync-lock.ts
import { db } from "../db";
import { appConfig } from "../db/schema";
import { eq } from "drizzle-orm";

const LOCK_KEY = "sync_lock";
const LOCK_TIMEOUT_MIN = 10;

export function acquireSyncLock(): boolean {
  const now = Date.now();
  const existing = db.select().from(appConfig).where(eq(appConfig.key, LOCK_KEY)).get();

  if (existing) {
    // 10分以上前のロックは古いとみなして奪う
    const lockedAt = parseInt(existing.value, 10);
    const elapsedMin = (now - lockedAt) / 1000 / 60;
    if (elapsedMin < LOCK_TIMEOUT_MIN) {
      return false; // ロック中。二重実行を拒否
    }
  }

  db.insert(appConfig).values({ key: LOCK_KEY, value: String(now) })
    .onConflictDoUpdate({ target: appConfig.key, set: { value: String(now) } })
    .run();
  return true;
}

export function releaseSyncLock(): void {
  db.delete(appConfig).where(eq(appConfig.key, LOCK_KEY)).run();
}
```

`/api/sync` および cron の両方で、処理開始前に `acquireSyncLock()` を呼ぶ。`false` が返った場合:
- cron → スキップ（次回のcronで再試行）
- `/api/sync` → `409 Conflict` を返す（「同期中です。しばらくお待ちください」）

### 5.2 定期取得フロー

cron の tick 間隔は **5分固定**（`*/5 * * * *`）。各フィードの実際の取得可否は `feeds.fetchIntervalMin`（デフォルト30分）で判定する。tick 間隔はコードにハードコードし、設定画面からは変更しない。

```
[node-cron: */5 * * * *（5分ごと固定）]
   │
   ▼
[cronHandler()]
   │
   ├── DBからフィード一覧取得
   ├── 各フィードについて:
   │     ├── lastFetchedAt + fetchIntervalMin < now ならスキップ
   │     │
   │     ├── rss-parser でフィードURL取得
   │     │     ├── 成功 → 記事パース, consecutiveFetchFailures = 0
   │     │     └── 失敗 → lastFetchStatus="error", consecutiveFetchFailures++, 次のフィードへ
   │     │
   │     ├── 各記事について:
   │     │     ├── dedupHash 計算
   │     │     ├── INSERT ... ON CONFLICT(feedId, dedupHash) DO NOTHING
   │     │     ├── contentHtml = DOMPurify でサニタイズ
   │     │     ├── contentPlain = HTMLタグ除去したプレーンテキスト（AI入力用）
   │     │     ├── sortKey = publishedAt ?? Date.now()（非null保証）
   │     │     └── 言語自動検出（タイトルの文字種で簡易判定）
   │     │
   │     ├── lastFetchedAt, lastFetchStatus="ok" 更新
   │     │
   │     └── 新規記事があれば Stage1 AI処理を実行
   │           ├── Stage1はこのプロセス内で同期実行（インプロセス）
   │           ├── 1記事ずつ Gemini API 呼び出し
   │           ├── レート制限: 記事間に500msの間隔
   │           ├── JSON パース → バリデーション → DB更新
   │           ├── 失敗 → aiStage1Status="failed", aiStage1Error=詳細, 続行
   │           └── 全記事処理完了 or タイムアウト(5分) で終了
   │
   └── 完了ログ出力
```

### 5.3 エラーハンドリング方針

| 異常 | 対応 |
|------|------|
| フィードURL到達不可（DNS/接続/タイムアウト） | `lastFetchStatus="error"`, `consecutiveFetchFailures++`。3以上でUIに警告バッジ。成功時に0リセット |
| RSSパース失敗（不正XML等） | 同上 |
| LLM APIエラー（429/500/タイムアウト） | 該当記事の `aiStage1Status="failed"`, 次回cronで未処理分を再試行 |
| LLM レスポンスがJSON不正 | `parse-response.ts` で修復試行。修復不可なら `failed` |
| LLM safety block（コンテンツフィルタ） | `aiStage1Status="skipped"`, エラーではなく意図的スキップ |
| SQLite busy/locked | `busy_timeout=5000` で自動リトライ。超過したらエラーログ |
| プロセス再起動 | `aiStage1Status="processing"` のまま残った記事を検出 → `pending` にリセット |

### 5.3 「取得できた本文の翻訳」に関する注意

RSSフィードは全文を含まないことが多い（要約のみ、冒頭のみ）。本アプリでは:

- Stage2の翻訳対象は `contentHtml`（RSSから取得できた分）のみ
- 「全文翻訳」とは表記しない。UIでは「取得済み本文の翻訳」と表示
- 元記事のスクレイピングによる全文取得はv1では実装しない（法的・技術的リスク）
- `contentHtml` が空または短すぎる場合、翻訳は `null` を返しUIで「本文が取得できませんでした」と表示

---

## 6. Gemini APIクライアント

### 6.1 v1はGemini固定。抽象化しない

```typescript
// src/lib/llm/gemini.ts
interface GeminiChatParams {
  model: string;
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  maxOutputTokens?: number;
}

interface GeminiChatResult {
  content: string;
  inputTokens: number;
  outputTokens: number;
}

export async function geminiChat(params: GeminiChatParams): Promise<GeminiChatResult> {
  const apiKey = getDecryptedApiKey(); // app_configから復号

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${params.model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: params.systemPrompt }] },
        contents: [{ role: "user", parts: [{ text: params.userPrompt }] }],
        generationConfig: {
          temperature: params.temperature ?? 0.3,
          maxOutputTokens: params.maxOutputTokens ?? 1024,
          responseMimeType: "application/json",
        },
      }),
      signal: AbortSignal.timeout(30_000), // 30秒タイムアウト
    }
  );

  if (!res.ok) {
    const errBody = await res.text();
    throw new GeminiApiError(res.status, errBody);
  }

  const data = await res.json();

  // Safety block チェック
  if (!data.candidates || data.candidates.length === 0) {
    throw new GeminiBlockedError(data.promptFeedback?.blockReason || "UNKNOWN");
  }

  const candidate = data.candidates[0];
  if (candidate.finishReason === "SAFETY") {
    throw new GeminiBlockedError(candidate.safetyRatings);
  }

  const content = candidate.content?.parts?.[0]?.text;
  if (!content) {
    throw new GeminiEmptyResponseError();
  }

  return {
    content,
    inputTokens: data.usageMetadata?.promptTokenCount ?? 0,
    outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
  };
}

// カスタムエラークラス
export class GeminiApiError extends Error {
  constructor(public status: number, public body: string) {
    super(`Gemini API error ${status}: ${body.slice(0, 200)}`);
  }
}
export class GeminiBlockedError extends Error {
  constructor(public reason: unknown) {
    super(`Gemini safety block: ${JSON.stringify(reason)}`);
  }
}
export class GeminiEmptyResponseError extends Error {
  constructor() { super("Gemini returned empty response"); }
}
```

### 6.2 JSONレスポンスのパース・修復

```typescript
// src/lib/llm/parse-response.ts
import { z } from "zod"; // zodはバリデーション用に追加

// Stage1 のスキーマ
export const stage1Schema = z.object({
  summary: z.string().max(100),
  tags: z.array(z.string()).max(3),               // プロンプトの「最大3つ」と一致
  detectedLanguage: z.string().max(5).optional(),
});

// Stage2 のスキーマ
export const stage2Schema = z.object({
  summaryFull: z.string(),
  translation: z.string().nullable(),
  keyPoints: z.array(z.string()).max(10),
});

export function parseAndValidate<T>(raw: string, schema: z.ZodSchema<T>): T {
  // Step 1: そのままパース
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Step 2: よくある破損パターンの修復
    const repaired = raw
      .replace(/^```json\s*/i, "").replace(/```\s*$/, "")  // コードブロック除去
      .replace(/,\s*}/g, "}")                               // trailing comma
      .replace(/,\s*]/g, "]")                               // trailing comma in array
      .trim();

    try {
      parsed = JSON.parse(repaired);
    } catch (e) {
      throw new JsonParseError(raw, e);
    }
  }

  // Step 3: スキーマバリデーション
  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new JsonValidationError(raw, result.error);
  }

  return result.data;
}

export class JsonParseError extends Error {
  constructor(public raw: string, public cause: unknown) {
    super(`Failed to parse LLM JSON response: ${String(cause)}`);
  }
}
export class JsonValidationError extends Error {
  constructor(public raw: string, public zodError: z.ZodError) {
    super(`LLM JSON validation failed: ${zodError.message}`);
  }
}
```

### 6.3 プロンプト

```typescript
// src/lib/llm/prompts.ts
export const STAGE1_SYSTEM = `あなたはRSSフィード記事の要約アシスタントです。
記事のタイトルとテキストからJSON形式で要約を返してください。
タグは以下から最大3つ選択: AI, LLM, Frontend, Backend, Database, DevOps, Cloud, Security, Mobile, Fintech, Startup, Business, Design, OSS, Other`;

export function stage1UserPrompt(title: string, contentPlain: string): string {
  return `タイトル: ${title}\nテキスト: ${contentPlain.slice(0, 500)}`;
}

export const STAGE2_SYSTEM = `あなたは技術記事の翻訳・要約アシスタントです。
記事の本文から要約・翻訳・キーポイントをJSON形式で返してください。
翻訳は原文が日本語の場合はnullを返してください。
翻訳対象はRSSフィードから取得できた本文のみです。全文とは限りません。`;

export function stage2UserPrompt(title: string, contentPlain: string): string {
  // LLMにはHTMLではなくプレーンテキストを渡す（品質安定のため）
  return `タイトル: ${title}\n本文:\n${contentPlain.slice(0, 8000)}`;
}
```

---

## 7. HTMLサニタイズ

```typescript
// src/lib/sanitize.ts
import createDOMPurify from "dompurify";
import { JSDOM } from "jsdom";

const window = new JSDOM("").window;
const DOMPurify = createDOMPurify(window);

const ALLOWED_TAGS = [
  "p", "br", "strong", "em", "b", "i", "u", "s",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "ul", "ol", "li",
  "blockquote", "pre", "code",
  "a", "img",
  "table", "thead", "tbody", "tr", "th", "td",
  "figure", "figcaption",
  "hr", "sub", "sup",
];

const ALLOWED_ATTRS = {
  a: ["href", "title", "rel"],
  img: ["src", "alt", "width", "height"],
  code: ["class"],       // シンタックスハイライト用
  pre: ["class"],
  td: ["colspan", "rowspan"],
  th: ["colspan", "rowspan"],
};

export function sanitizeHtml(dirty: string): string {
  // DOMPurify hooks で属性を安全に付与（string replace による属性重複を防止）
  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    // aタグ: target="_blank" + rel="noopener noreferrer" を強制
    if (node.tagName === "A") {
      node.setAttribute("target", "_blank");
      node.setAttribute("rel", "noopener noreferrer");
    }
    // imgタグ: lazy loading + referrer漏洩防止
    if (node.tagName === "IMG") {
      node.setAttribute("loading", "lazy");
      node.setAttribute("referrerpolicy", "no-referrer");
    }
  });

  const clean = DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS,
    ALLOWED_ATTR: Object.values(ALLOWED_ATTRS).flat(),
    FORBID_TAGS: ["script", "style", "iframe", "object", "embed", "form", "input"],
    FORBID_ATTR: ["onerror", "onclick", "onload", "onmouseover"],
    WHOLE_DOCUMENT: false,
    RETURN_DOM: false,
  });

  // hooks はグローバルに残るので除去
  DOMPurify.removeHook("afterSanitizeAttributes");
  return clean;
}
```

**外部画像のポリシー**:

RSSフィード内の `<img>` タグはそのまま表示する（外部URLを直接参照）。ただし以下のリスクを認識した上での判断:

- **Tracking pixel**: 外部画像の読み込みにより、閲覧者のIPアドレスやUser-Agentがフィード提供元に送信される
- **対策**: `referrerpolicy="no-referrer"` を全imgに付与（リファラ送信を防止）
- **将来の改善（v1.1）**: 画像プロキシの導入、または「外部画像を読み込むか」の設定オプション

CSPヘッダ（`next.config.ts` で設定）:
```typescript
// next.config.ts
const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",  // Next.js inline scripts
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' https: data:",         // 外部画像許可
      "font-src 'self'",
      "connect-src 'self' https://generativelanguage.googleapis.com",  // Gemini API
    ].join("; "),
  },
];
```

---

## 8. テーマシステム

`next-themes` で `class` ベース。CSS変数で色定義。

```css
/* globals.css */
@import "tailwindcss";

:root {
  --bg: #ffffff;
  --fg: #18181b;
  --card: #f4f4f5;
  --card-border: #e4e4e7;
  --sidebar-bg: #fafafa;
  --accent: #0d9488;
  --accent-fg: #ffffff;
  --accent-subtle: rgba(13, 148, 136, 0.08);
  --muted: #71717a;
  --unread-dot: #0d9488;
  --ai-border: rgba(13, 148, 136, 0.2);
  --ai-bg: rgba(13, 148, 136, 0.04);
}

.dark {
  --bg: #111118;
  --fg: #d4d4d8;
  --card: rgba(255, 255, 255, 0.02);
  --card-border: rgba(255, 255, 255, 0.06);
  --sidebar-bg: #141419;
  --accent: #2dd4bf;
  --accent-fg: #111118;
  --accent-subtle: rgba(45, 212, 191, 0.08);
  --muted: #71717a;
  --unread-dot: #2dd4bf;
  --ai-border: rgba(45, 212, 191, 0.15);
  --ai-bg: rgba(45, 212, 191, 0.04);
}
```

---

## 9. デプロイ

### 9.1 Docker Compose

```yaml
version: "3.9"
services:
  app:
    build: .
    container_name: yomu
    restart: unless-stopped
    ports:
      - "3000:3000"
    volumes:
      - yomu-data:/app/data
    environment:
      - NODE_ENV=production
      - ENCRYPTION_KEY=${ENCRYPTION_KEY}
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/api/setup"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 10s

volumes:
  yomu-data:
```

Redis不要。workerプロセス不要。Next.jsの単一プロセスで完結。

### 9.2 Dockerfile

```dockerfile
FROM node:22-slim AS base
RUN corepack enable pnpm && apt-get update && apt-get install -y curl sqlite3 && rm -rf /var/lib/apt/lists/*

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build && pnpm build:scripts

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
RUN mkdir -p /app/data && chown nextjs:nodejs /app/data

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# drizzle マイグレーション用
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/drizzle.config.ts ./

COPY --from=builder /app/entrypoint.sh ./
RUN chmod +x ./entrypoint.sh
USER nextjs
EXPOSE 3000
ENV HOSTNAME="0.0.0.0"
ENTRYPOINT ["./entrypoint.sh"]
```

### 9.3 起動シーケンス（entrypoint.sh）

初回起動時のDB作成、マイグレーション、cron初期化を一箇所で制御する。

```bash
#!/bin/sh
set -e

echo "[yomu] Running database migrations..."
node dist/migrate.js

echo "[yomu] Resetting stale processing states..."
node dist/reset-stale.js

echo "[yomu] Starting server..."
exec node server.js
```

migration と stale reset はビルド成果物に含まれる専用スクリプトで実行する（`node -e` でのインライン require は standalone に依存が含まれない可能性があるため使わない）。

**ビルドパイプライン**:

`pnpm build` は Next.js の build のみ。`src/scripts/*.ts` は別途 `tsx` で実行する。

```jsonc
// package.json (scripts 抜粋)
{
  "scripts": {
    "dev": "next dev --turbopack",
    "build": "next build",
    "build:scripts": "tsx --compile src/scripts/migrate.ts src/scripts/reset-stale.ts --out-dir dist",
    "start": "node server.js",
    "db:migrate": "tsx src/scripts/migrate.ts",
    "db:push": "drizzle-kit push",
    "db:studio": "drizzle-kit studio"
  }
}
```

`next.config.ts` で `output: "standalone"` を明示する（Dockerfile が `.next/standalone` を前提とするため）:

```typescript
// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["better-sqlite3"],  // native module を bundle から除外
  headers: async () => [{
    source: "/(.*)",
    headers: [
      { key: "Content-Security-Policy", value: [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' https: data:",
        "font-src 'self'",
        "connect-src 'self' https://generativelanguage.googleapis.com",
      ].join("; ") },
    ],
  }],
};
export default nextConfig;
```

```typescript
// src/scripts/migrate.ts（ビルド対象に含める）
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";

const sqlite = new Database("/app/data/yomu.db");
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");
const db = drizzle(sqlite);
migrate(db, { migrationsFolder: "./drizzle" });
console.log("[yomu] Migrations complete.");
sqlite.close();
```

```typescript
// src/scripts/reset-stale.ts（ビルド対象に含める）
import Database from "better-sqlite3";

const db = new Database("/app/data/yomu.db");
db.exec("UPDATE articles SET ai_stage1_status = 'pending' WHERE ai_stage1_status = 'processing'");
db.exec("UPDATE articles SET ai_stage2_status = 'none' WHERE ai_stage2_status = 'processing'");
// 10分以上前のsync lockを解放
const tenMinAgo = Date.now() - 10 * 60 * 1000;
db.prepare("DELETE FROM app_config WHERE key = 'sync_lock' AND CAST(value AS INTEGER) < ?").run(tenMinAgo);
console.log("[yomu] Stale states reset.");
db.close();
```

Dockerfile に以下を追加:
```dockerfile
# ビルド時にmigration/resetスクリプトもコンパイル
COPY --from=builder /app/dist/migrate.js ./dist/
COPY --from=builder /app/dist/reset-stale.js ./dist/
COPY --from=builder /app/entrypoint.sh ./
RUN chmod +x ./entrypoint.sh
```

cron の初期化は Next.js の `instrumentation.ts`（App Router の bootstrap hook）で一度だけ行う。

```typescript
// src/instrumentation.ts
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { initCron } = await import("./lib/cron");
    initCron();
    console.log("[yomu] Cron scheduler initialized.");
  }
}
```

### 9.3 リバースプロキシ（Caddy推奨）

```
# Caddyfile（ホスト側）
yomu.example.com {
    reverse_proxy localhost:3000
}
```

TLS終端はCaddyが自動で行う。`NEXTAUTH_URL` 的な環境変数は不要（シングルユーザー、Auth.js不使用）。

### 9.4 環境変数

```bash
# .env
ENCRYPTION_KEY=       # openssl rand -hex 32
```

これだけ。Gemini APIキーはUI経由で設定し、暗号化してDBに保存。

---

## 10. テスト方針

Phase 1からテストを書く。テストは最後ではなく最初から入れる。

### 10.1 テスト対象と優先度

| 優先度 | 対象 | テスト種別 | 理由 |
|--------|------|-----------|------|
| **P0** | `dedup.ts` | unit | 重複記事の判定ミスは致命的 |
| **P0** | `parse-response.ts` | unit | LLMのJSON破損は頻出 |
| **P0** | `sanitize.ts` | unit | XSSの防止 |
| **P0** | `auth.ts` | unit | 認証の不備は致命的 |
| **P1** | `fetcher.ts` | integration | RSS取得失敗時の振る舞い |
| **P1** | `gemini.ts` | integration (mock) | API異常系（429, 500, safety block, empty response） |
| **P1** | `/api/articles` | integration | cursor pagination, フィルタ |
| **P2** | `/api/feeds` | integration | 追加/削除/OPML |

### 10.2 テスト例

```typescript
// __tests__/lib/rss/dedup.test.ts
import { describe, it, expect } from "vitest";
import { computeDedupHash } from "@/lib/rss/dedup";

describe("computeDedupHash", () => {
  const feedId = "feed-001";

  it("guidが存在する場合はguidベースのハッシュ", () => {
    const hash = computeDedupHash(feedId, { guid: "abc-123", link: "https://example.com/1", title: "Test" });
    expect(hash).toHaveLength(32);
  });

  it("同じguidは同じハッシュ", () => {
    const h1 = computeDedupHash(feedId, { guid: "abc-123", link: "", title: "" });
    const h2 = computeDedupHash(feedId, { guid: "abc-123", link: "https://other.com", title: "Other" });
    expect(h1).toBe(h2);
  });

  it("guidがなければURLベース", () => {
    const h1 = computeDedupHash(feedId, { guid: "", link: "https://example.com/post?utm_source=twitter", title: "" });
    const h2 = computeDedupHash(feedId, { guid: "", link: "https://example.com/post", title: "" });
    expect(h1).toBe(h2); // UTMパラメータ除去後に一致
  });

  it("異なるフィードの同じguidは異なるハッシュ", () => {
    const h1 = computeDedupHash("feed-001", { guid: "abc", link: "", title: "" });
    const h2 = computeDedupHash("feed-002", { guid: "abc", link: "", title: "" });
    expect(h1).not.toBe(h2);
  });
});
```

---

## 11. 開発ロードマップ

### Phase 1: 基盤+RSS基本（Week 1-3）

テストはこのフェーズから書く。起動・同期・認証・秘密情報を先に固める。

**Week 1: 起動境界・認証・DB**
- [ ] プロジェクトスキャフォールド（Next.js 16.2 + TS + Tailwind 4 + pnpm）
- [ ] Docker Compose + Dockerfile + entrypoint.sh
- [ ] SQLiteセットアップ（WAL, Drizzle, マイグレーション, FTS5トリガー）
- [ ] `instrumentation.ts` でのcron初期化
- [ ] 初回セットアップ（パスワード設定 + レート制限）
- [ ] ログイン/ログアウト（セッションハッシュ + 有効期限 + テスト）
- [ ] Settings API（hasGeminiApiKey方式、APIキー暗号化保存）
- [ ] バックアップスクリプト

**Week 2: フィード取得コア**
- [ ] フィード追加（URL入力 → パース検証 → 保存）
- [ ] OPMLインポート
- [ ] node-cron 定期取得 + sync lock（二重実行防止）
- [ ] 重複判定（dedup.ts + テスト）
- [ ] HTMLサニタイズ（rel=noopener, referrerpolicy + テスト）
- [ ] プロセス再起動時の stale status リセット

**Week 3: 記事閲覧UI**
- [ ] 3カラムレイアウト（サイドバー + 記事リスト + 記事詳細）
- [ ] フィード一覧サイドバー（カテゴリ折りたたみ、未読数）
- [ ] 記事一覧（cursor pagination）
- [ ] 記事詳細表示
- [ ] 既読/未読（自動既読、手動切替、一括既読）
- [ ] スター
- [ ] 全文検索（FTS5）
- [ ] テーマ切替（ライト/ダーク/システム）
- [ ] キーボードショートカット（j/k/o/m/s/v）

### Phase 2: LLM統合（Week 4-5）

- [ ] Geminiクライアント（エラーハンドリング、タイムアウト、safety block対応）
- [ ] JSONパース修復（parse-response.ts + テスト）
- [ ] 設定画面（Gemini APIキー、モデル選択）
- [ ] Stage1処理（cron内で同期実行、レート制限）
- [ ] Stage1 リトライ（前回failedの記事を再処理）
- [ ] プロセス再起動時の processing → pending リセット
- [ ] Stage2処理（オンデマンド、同期API）
- [ ] UI: AI要約カード、翻訳カード、キーポイントカード
- [ ] 「本文が取得できませんでした」の表示ハンドリング

### Phase 3: 仕上げ（Week 6-7）

- [ ] レスポンシブ（モバイルはシングルカラム切替）
- [ ] エラー状態の一覧（フィード取得失敗、LLM失敗）の管理UI
- [ ] パフォーマンス計測・最適化
- [ ] README（セットアップ手順、環境変数、バックアップ）
- [ ] CHANGELOG
- [ ] ライセンス選定
- [ ] GitHub公開

---

## 12. v1.1 で入れるもの（予告）

v1が安定運用に乗った後:

- Xいいね分析（OAuth PKCE, いいね取得, オンデマンドAI分析）
- OPMLエクスポート
- LLMマルチプロバイダ（OpenAI, Anthropic対応）
- 記事の本文抽出（Readability.js等）による翻訳品質向上
