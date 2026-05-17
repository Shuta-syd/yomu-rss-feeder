# 記事メモ機能 設計書

## 背景

ユーザは気になった記事に対して個人的な意見・感想・後で見返す用のメモを残したい。現状 Yomu には `is_starred` (お気に入り) しかなく、自由テキストで残せる場所が無い。

将来的には同じホームサーバーにセルフホストしている [Memos](https://github.com/usememos/memos) と連携して自動転送するアイデアがあるが、今回のスコープからは外す。

## 目的

記事詳細ペインから 1 記事につき 1 つのシンプルテキストメモを書き残せるようにする。メモの有無は記事リストで一目で分かるようにする。

## 仕様

### データモデル

`articles` テーブルに `note` カラムを追加。

```sql
ALTER TABLE articles ADD COLUMN note TEXT;
```

- 型: `TEXT NULL`
- デフォルト: `NULL`
- 空文字 `""` と `NULL` は同一視（API レイヤで空白 trim 後に空なら `NULL` に正規化）

Drizzle スキーマ ([src/lib/db/schema.ts](../../../src/lib/db/schema.ts)) にも `note: text("note")` を追加。

新マイグレーション `drizzle/0005_articles_note.sql` を作成する。

### API

#### `PATCH /api/articles/[id]`

既存エンドポイント ([src/app/api/articles/\[id\]/route.ts](../../../src/app/api/articles/[id]/route.ts)) の `patchSchema` に `note` を追加。

```ts
const patchSchema = z.object({
  isRead: z.boolean().optional(),
  isStarred: z.boolean().optional(),
  note: z.string().nullable().optional(),
});
```

ハンドラ側で `parsed.data.note` を正規化:

```ts
if ("note" in parsed.data) {
  const trimmed = parsed.data.note?.trim();
  updates.note = trimmed ? trimmed : null;
}
```

#### レスポンス形を `ArticleDTO` に統一

**既存バグの修正を合わせて行う**。現在の PATCH は更新後に `db.select().from(articles).where(...)` で raw row をそのまま返すため、`feedTitle` が落ちる ([src/app/api/articles/\[id\]/route.ts:47](../../../src/app/api/articles/[id]/route.ts#L47))。クライアントはこれを記事リスト行とも置き換えるため、PATCH 後の記事は `feedTitle = undefined` で再描画され、リスト行の右下のフィード名が消える既存バグがある。

このバグは note 機能が同じパターンで PATCH を投げることで顕在化するので、合わせて修正する。具体的には PATCH ハンドラを以下のように改める:

```ts
import { rawDb } from "@/lib/db";
// ...
db.update(articles).set(updates).where(eq(articles.id, id)).run();
const row = rawDb
  .prepare(
    "SELECT a.*, f.title AS feed_title FROM articles a LEFT JOIN feeds f ON f.id = a.feed_id WHERE a.id = ?",
  )
  .get(id) as Record<string, unknown> | undefined;
if (!row) return jsonError(404, "Not found");
return NextResponse.json(rowToArticle(row));
```

`rowToArticle` は [src/lib/articles-query.ts:38](../../../src/lib/articles-query.ts#L38) のものを export して再利用する。これで list と PATCH の DTO 形が完全一致する。

### 型

[src/types/article.ts](../../../src/types/article.ts) の `ArticleDTO` に `note: string | null` を追加。

[src/lib/articles-query.ts](../../../src/lib/articles-query.ts) の `rowToArticle` で `note` を SELECT 結果から読み出す。`SELECT a.* ...` で取れるので SQL 自体に変更不要。

### UI

#### 記事詳細ペイン

[src/components/articles/ArticleDetail.tsx](../../../src/components/articles/ArticleDetail.tsx) のタイトル下、または右端のアクション群（お気に入りボタン付近）に「メモ」セクションを追加する。デフォルトは折りたたみ。

```
┌─ 記事タイトル ──────────────────────┐
│ feed名 / 著者 / 日付                │
│ [☆お気に入り] [↻Stage1] [📝メモ▾]  │  ← メモトグル
├──────────────────────────────────┤
│ (展開時)                            │
│ ┌────────────────────────────┐    │
│ │ 自由テキスト textarea (4行)  │    │
│ │                              │    │
│ └────────────────────────────┘    │
│  💾 保存済み (3秒前)                │
└──────────────────────────────────┘
```

#### 保存方式

debounce 500ms の自動保存。textarea onChange でローカル state を更新し、500ms 入力が止まったら `PATCH /api/articles/[id]` を投げる。保存中・保存済みのインジケータを下部に小さく出す。

##### 競合・記事切替の取り扱い (Codex レビュー反映)

クライアント側の AbortController は **サーバ到達後の PATCH をキャンセルできない**ため、それ単体では「最後の編集が勝つ」を保証できない。代わりに**1 記事につき同時 1 PATCH まで**にシリアライズし、その間に新たな編集が来ても in-flight の完了を待ってから次の PATCH を投げる、というロジックを採用する。これによりサーバ到達順序 = クライアント発火順序となり、last-write-wins が成立する。

**(a) 記事切替時の state 完全リセット**

`<ArticleDetail key={selected?.id ?? "empty"} ... />` を親側で指定し、`article.id` が変わるたびに ArticleDetail を unmount → mount させて state を完全に新規化する。`selected` が `null` の時は `"empty"` を使って null セーフに。

**(b) モジュールスコープの per-article 保存キュー**

コンポーネント instance 内に state を持つと、unmount → remount で別の instance が同じ article id に対して別キューを持ってしまい、in-flight 同士が衝突する (Codex 指摘)。これを根本解決するため、**保存ロジックを React の外、モジュールスコープに切り出す**。`articleId → 保存キュー` のマップを持ち、同じ articleId への保存は必ず同じキューでシリアル処理される。

新規ファイル `src/lib/article-note-saver.ts`:

```ts
import type { ArticleDTO } from "@/types/article";

type Status = "idle" | "saving" | "saved";
type StatusListener = (s: Status) => void;
type UpdateListener = (a: ArticleDTO) => void;

interface Queue {
  desired: string;           // ユーザ入力の最新値
  lastSent: string;          // 最後に送信成功した値
  inflight: Promise<void>;   // シリアル化のための尾
  debounceTimer: ReturnType<typeof setTimeout> | null;
  status: Status;
  statusListeners: Set<StatusListener>;
}

const DEBOUNCE_MS = 500;
const queues = new Map<string, Queue>();
const updateListeners = new Set<UpdateListener>();

function getQueue(id: string, initial: string): Queue {
  let q = queues.get(id);
  if (!q) {
    q = {
      desired: initial,
      lastSent: initial,
      inflight: Promise.resolve(),
      debounceTimer: null,
      status: "idle",
      statusListeners: new Set(),
    };
    queues.set(id, q);
  }
  return q;
}

function setStatus(q: Queue, s: Status) {
  q.status = s;
  for (const l of q.statusListeners) l(s);
}

export function scheduleNoteSave(articleId: string, value: string, initial: string) {
  const q = getQueue(articleId, initial);
  q.desired = value;
  if (q.debounceTimer) clearTimeout(q.debounceTimer);
  setStatus(q, "saving"); // ユーザの目には「typing → 保存待ち」
  q.debounceTimer = setTimeout(() => {
    q.debounceTimer = null;
    q.inflight = q.inflight.then(() => drain(articleId, q));
  }, DEBOUNCE_MS);
}

async function drain(id: string, q: Queue) {
  while (q.desired !== q.lastSent) {
    const value = q.desired;
    try {
      const res = await fetch(`/api/articles/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: value.trim() || null }),
      });
      if (!res.ok) {
        setStatus(q, "idle");
        return;
      }
      const updated = (await res.json()) as ArticleDTO;
      q.lastSent = value;
      for (const l of updateListeners) l(updated);
    } catch {
      setStatus(q, "idle");
      return;
    }
  }
  setStatus(q, "saved");
}

export function subscribeStatus(articleId: string, initial: string, listener: StatusListener): () => void {
  const q = getQueue(articleId, initial);
  q.statusListeners.add(listener);
  listener(q.status); // 初期通知
  return () => q.statusListeners.delete(listener);
}

export function subscribeUpdates(listener: UpdateListener): () => void {
  updateListeners.add(listener);
  return () => updateListeners.delete(listener);
}
```

ArticleDetail はキューに `scheduleNoteSave` を投げ、ステータスを subscribe するだけ:

```tsx
const [note, setNote] = useState(article.note ?? "");
const [status, setStatus] = useState<Status>("idle");

useEffect(() => {
  return subscribeStatus(article.id, article.note ?? "", setStatus);
}, [article.id, article.note]);

function handleChange(v: string) {
  setNote(v);
  scheduleNoteSave(article.id, v, article.note ?? "");
}
```

親 (page.tsx) でグローバル update リスナーを 1 回だけ登録し、`onChange` 同等の id ガード処理を行う:

```tsx
useEffect(() => {
  return subscribeUpdates((updated) => {
    setSelected((cur) => (cur?.id === updated.id ? updated : cur));
    setArticles((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
  });
}, []);
```

**Codex blocker への対応の正しさ:**

- **#1 (cross-remount で in-flight 重複)**: 解決。キューは `articleId` をキーにモジュールスコープで保持されるので、`<ArticleDetail>` が unmount → remount しても同じキューを使う。`q.inflight = q.inflight.then(drain)` で必ずシリアル実行され、同一 article に対して同時 PATCH は起きない。
- **#2 (`stoppedRef` が `await res.json()` 後にチェックされない)**: 解決。コンポーネントは保存ロジックを持たないので unmount による中断という概念がない。update リスナーは親に 1 つだけ存在し、id ガード付きなので unmount 中の articleに対するレスポンスが届いても無視される（記事リスト側の更新は問題ない、常にいま該当 id の行を更新するだけ）。
- **#3 (keepalive と in-flight の併存)**: 解決。**keepalive を一切使わない**。タブを閉じる際の保存はブラウザ依存だが、これは元から仕様外。debounce 中（500ms 以内）に切り替え/閉じる場合のみ最新値が失われる。

**トレードオフ**: debounce 500ms 中に記事切替やタブクローズが起きると、その間の最新入力は保存されない。実用上 500ms 待てば問題ない。完全保証が必要なら将来 `If-Match` ヘッダによる楽観ロックや手動「保存」ボタンを追加する（今回はスコープ外）。

**(d) 親の `onChange` を id ガード付きに**

PATCH が遅延して別記事に切替後に解決した場合、親が `setSelected(updated)` を無条件に呼ぶと表示中記事が前のに戻る。親 ([src/app/feeds/page.tsx:490](../../../src/app/feeds/page.tsx#L490)) の `onChange` を以下に変更:

```ts
onChange={(a) => {
  setSelected((cur) => (cur?.id === a.id ? a : cur));
  setArticles((prev) => prev.map((x) => (x.id === a.id ? a : x)));
}}
```

これで `setSelected` は現在表示中記事と同一 ID のときだけ反映、リストは id 基準で独立更新される。既存の isRead/isStarred 更新にも適用されるが、より堅牢になるだけで挙動は変わらない。

#### 開閉状態の永続化

折りたたみのデフォルトは「メモが空のときは閉じる / 既存メモがあるときは自動的に開く」。`article.id` を key にした再マウントなので、記事切替ごとに自然にデフォルト状態に戻る。localStorage 永続化はしない。

#### 記事リスト行のインジケータ

[src/components/articles/ArticleList.tsx](../../../src/components/articles/ArticleList.tsx) に「メモあり」アイコンを追加。`a.note` が空でない記事の行に、お気に入り星アイコンと同じ並びで 📝 を表示する。

```tsx
{a.note && <span className="shrink-0" title="メモあり">📝</span>}
```

### 既存機能との整合

- お気に入り (`isStarred`): 直交。メモがあるかどうかとお気に入りかどうかは独立
- 既読 (`isRead`): 直交。メモを書いても既読状態は変えない
- AI 翻訳・要約: 影響なし
- 既読フィルタ (新規追加した `readFilter`): 影響なし、メモは表示するだけで絞り込まない
- mark-all-read: メモは触らない (既存挙動維持)
- 検索 (FTS): 今回はメモを FTS インデックスに含めない（YAGNI、将来の課題）

## 非目的 (YAGNI)

- Markdown レンダリング (今回はプレーンテキストのみ)
- 複数メモ・履歴
- Memos 連携（別イテレーション）
- 外部共有ボタン (Web Share API / clipboard)
- メモの全文検索（FTS index）
- メモのある記事だけを表示するフィルタ
- メモの作成日・更新日表示

これらは追加要件が出てきたら別 PR で。

## テスト

- API レベル: メモ更新後に `note` が正しく永続化されることを確認 (vitest + better-sqlite3 in-memory)
  - 空文字を送ったら `note=null` に正規化される
  - 前後空白のみも `null`
  - 通常テキストはそのまま
  - 既存の `isRead` / `isStarred` 更新と共存（同時送信できる）
  - PATCH 後のレスポンスに `feedTitle` が含まれる（既存バグの修正検証）
- 保存キュー (`article-note-saver.ts`) の単体テスト: `fetch` をモック
  - 連続 3 回 `scheduleNoteSave` を呼ぶと debounce 後に最新値だけ 1 回 PATCH される
  - PATCH 中に新規 `scheduleNoteSave` が来たら次の iteration で 1 回追加 PATCH される
  - 失敗時に status が `idle` に戻る
  - 同じ articleId で異なる instance のリクエストが衝突しない（cross-remount シミュレーション）
- UI レベル: 手動で確認
  - メモを書いて 500ms 待つと保存表示が出る
  - リロード後もメモが残っている
  - リスト行に 📝 が出る
  - 空にすると 📝 が消える

## 影響範囲

| ファイル | 変更内容 |
|---------|---------|
| `drizzle/0005_articles_note.sql` (新規) | `ALTER TABLE articles ADD COLUMN note TEXT` |
| `src/lib/db/schema.ts` | `articles` テーブルに `note: text("note")` 追加 |
| `src/lib/articles-query.ts` | `rowToArticle` で `note` 読み出し |
| `src/types/article.ts` | `ArticleDTO.note: string \| null` 追加 |
| `src/app/api/articles/[id]/route.ts` | `patchSchema` に `note` 追加 + trim 正規化 |
| `src/components/articles/ArticleDetail.tsx` | メモ折りたたみ UI + saver 呼び出し + status subscribe |
| `src/lib/article-note-saver.ts` (新規) | モジュールスコープの per-article 保存キュー (debounce / serialize / status pub-sub) |
| `__tests__/lib/article-note-saver.test.ts` (新規) | saver の単体テスト |
| `src/app/feeds/page.tsx` | `<ArticleDetail key={selected?.id ?? "empty"}>` で記事切替時に再マウント、`subscribeUpdates` で id ガード付き反映 |
| `src/lib/articles-query.ts` | `rowToArticle` を export (PATCH ハンドラから再利用するため) |
| `src/components/articles/ArticleList.tsx` | 📝 インジケータ表示 |
| `__tests__/lib/article-note.test.ts` (新規) | API 正規化ロジックのテスト |
