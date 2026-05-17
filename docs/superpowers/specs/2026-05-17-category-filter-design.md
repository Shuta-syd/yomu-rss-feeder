# カテゴリ別記事表示 設計書

## 背景

現在、サイドバーは「すべて / お気に入り / X いいね / 個別フィード」のいずれかを選んで記事を絞り込めるが、カテゴリ単位（BLOG, BUSSINESS, COMPANY BLOG など）での閲覧はできない。サイドバー上でフィードは既にカテゴリ別にグルーピングされているものの、ヘッダのクリックは展開/折りたたみ、ダブルクリックはリネームに割り当て済みで、選択トリガがない。

## 目的

カテゴリ名をクリックすると、そのカテゴリに属する全フィードの記事を一覧表示できるようにする。検索、ページネーション、`全て既読` 操作と整合する形で動作させる。

## 仕様

### 選択モデル

「カテゴリ選択」を新しい第一級の状態として追加する。既存の `view: 'feeds' | 'likes' | 'starred'` と `selectedFeedId: string | null` の組に対して、`selectedCategory: string | null` を加える。同時に有効になるのは以下のいずれか一つ。

- `すべて`: view='feeds', selectedFeedId=null, selectedCategory=null
- `お気に入り`: view='starred', selectedFeedId=null, selectedCategory=null
- `X いいね`: view='likes', selectedFeedId=null, selectedCategory=null
- `カテゴリ`: view='feeds', selectedFeedId=null, selectedCategory='BLOG'
- `フィード`: view='feeds', selectedFeedId='abc', selectedCategory=null

排他性を担保するため、`onSelect(feedId)` / `onSelectLikes` / `onSelectStarred` / `すべて` 選択の各ハンドラで `setSelectedCategory(null)` を必ず呼ぶ。同様にカテゴリ選択時は `setSelectedFeedId(null)` する。

### サイドバー UI

カテゴリヘッダの構造を以下に変更する。**select mode 中は従来通り「カテゴリ内フィードの一括選択 checkbox」として動作させ、カテゴリフィルタは無効**。

通常モード (`!selectMode`) 時のヘッダ構造:

- **カテゴリ名ボタン** (`<button>`): クリックで「そのカテゴリを選択」（`onSelectCategory(category)`）。リネームは廃止し別 UI へ移す（下記参照）
- **▾/▸ アイコンボタン**: クリックで展開/折りたたみのみ
- **未読数バッジ**: カテゴリ名の右側に、そのカテゴリ内フィードの `unreadCount` 合計を表示（フィードの値を sum するだけで取得可能）

選択中カテゴリは `var(--accent-subtle)` でハイライト。**「すべて」ボタンのハイライト条件は `view === 'feeds' && selectedFeedId === null && selectedCategory === null` に修正する**。

#### リネーム UI の移動

現在ダブルクリックでカテゴリ名を入力可能にしている動作は、シングルクリックの選択挙動と競合するため廃止する。代わりに**カテゴリヘッダのホバー時に右端に小さな「✎」ボタンを表示**し、それをクリックしたときのみ rename input に切り替える。これで click/double-click の判別タイマー（既知の UX 上の遅延要因）を避けつつ、ユーザは引き続きカテゴリ名を変更できる。

### バックエンド API

#### `GET /api/articles`

新規クエリ `category` を追加。

```
GET /api/articles?category=BLOG&search=foo&cursor=...
```

`feedId` と `category` は同時指定不可（指定された場合は `feedId` を優先、`category` は無視）。`articles-query.ts` の `listArticles` に `category?: string` を追加。

**SQL は count 側との整合のため、サブクエリ方式に統一する**:

```sql
-- list
SELECT a.*, f.title AS feed_title
FROM articles a
LEFT JOIN feeds f ON f.id = a.feed_id
WHERE a.feed_id IN (SELECT id FROM feeds WHERE category = ?)
  AND <その他の条件>
ORDER BY a.sort_key DESC, a.id DESC
LIMIT ?

-- count
SELECT COUNT(*)
FROM articles a
WHERE a.feed_id IN (SELECT id FROM feeds WHERE category = ?)
  AND <その他の条件>
```

これにより、設計時に Codex が指摘した「count 側に JOIN がない」問題を回避し、`articles a` の `idx_articles_sort` を効かせやすくする。性能確認として、実装時に `EXPLAIN QUERY PLAN` を実行し、両クエリが期待通り index を使うことを確認する。

**パラメータ正規化**: API 入口で `category` の前後空白を `trim()` し、空文字なら未指定と同じ扱いにする（`undefined` として扱う）。URL エンコードは `URLSearchParams` の標準動作に任せる（`COMPANY BLOG` → `category=COMPANY+BLOG`、`未分類` → `category=%E6%9C%AA%E5%88%86%E9%A1%9E`）。

#### `POST /api/articles/mark-all-read`

リクエストボディに `category` を追加。

```ts
const bodySchema = z
  .object({ feedId: z.string().optional(), category: z.string().optional() })
  .optional();
```

`feedId` と `category` は同時指定不可、両方指定された場合は 400。`category` 指定時は、Drizzle で以下相当のサブクエリを使用:

```sql
UPDATE articles
SET is_read = 1, read_at = ?
WHERE is_read = 0
  AND feed_id IN (SELECT id FROM feeds WHERE category = ?)
```

`category` も `trim()` で正規化し、空なら未指定扱い。

### フロントエンドの変更点

- `src/app/feeds/page.tsx`:
  - `selectedCategory: string | null` state を追加
  - すべての他選択ハンドラ（`onSelect` / `onSelectLikes` / `onSelectStarred` / `すべて`）で `setSelectedCategory(null)` を呼ぶ
  - `loadArticles` の URLSearchParams に `category` を反映（`selectedFeedId` が無い場合のみ）
  - `markAllRead` のボディに `category` を反映（`selectedFeedId` 優先）
- `src/components/feeds/FeedSidebar.tsx`:
  - `Props` に `selectedCategory: string | null`, `onSelectCategory(category: string): void`, `onCategoryRenamed?(oldName: string, newName: string): void` を追加
  - `CategoryGroup` のヘッダを 2〜3 要素に分割（名前ボタン / 開閉ボタン / ホバー時ペンシルボタン）
  - select mode 中はカテゴリフィルタを無効化（既存の checkbox label 挙動を維持）
  - 「すべて」ボタンのハイライト条件に `selectedCategory === null` を追加
  - 選択中カテゴリのハイライトと未読数表示

### カテゴリ rename / 削除との整合

#### Rename コールバックの契約

新規プロップ `onCategoryRenamed?(oldName: string, newName: string): void` を `FeedSidebar` に追加する。契約は以下の通り。

**発火元**: `FeedSidebar` 内の `renameCategory` 関数（`src/components/feeds/FeedSidebar.tsx:121-129`）。PATCH `/api/categories` が `res.ok` を返した直後、既存の `onFeedMoved?.()` に続けて `onCategoryRenamed?.(oldName, newName)` を呼ぶ。`oldName` は引数 `oldName` をそのまま、`newName` は `newName.trim()` 後の文字列を渡す（既存 trim ロジックと同一）。

```ts
// FeedSidebar.tsx (revised renameCategory)
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

**受け側 (`page.tsx`)**: 以下のハンドラをそのまま渡す。

```ts
// page.tsx
onCategoryRenamed={(oldName, newName) => {
  setSelectedCategory((cur) => (cur === oldName ? newName : cur));
}}
```

これによりカテゴリ名変更時、現在選択中だった場合のみ `selectedCategory` を新名で更新する。`loadArticles` は `selectedCategory` の変化を依存に持つので、自動的に再フェッチされる。

#### 空カテゴリ同期

**カテゴリ内全フィードが消えた時** (delete / 他カテゴリへ move 完了後): サイドバーの `grouped` から該当カテゴリが消える。`page.tsx` で以下の `useEffect` を追加し、`feeds` 更新後に `selectedCategory` が現存カテゴリ集合に含まれていない場合は `null` にリセットする。

```ts
useEffect(() => {
  if (selectedCategory === null) return;
  const exists = feeds.some((f) => f.category === selectedCategory);
  if (!exists) setSelectedCategory(null);
}, [feeds, selectedCategory]);
```

`onFeedMoved` は従来通り「フィードのカテゴリ移動・renameの後にフィード一覧を再取得するためのトリガ」という単一責務に留め、rename の差分情報は新コールバック `onCategoryRenamed` で受け渡す（責務分離）。

### モバイル挙動

カテゴリ選択時もフィード選択時と同様に、選択直後にリスト画面へ遷移（`goToMobileView("list")`）。

### 既存機能との整合

- 検索: カテゴリ選択中も `search` パラメータと併用可能
- ページネーション: 既存の cursor は sortKey/id のみで、カテゴリ条件と独立に動く
- 「全て既読」ボタン: カテゴリ選択時はそのカテゴリ内の記事のみ既読化
- AI status バナー: 影響なし（変更不要）
- select mode: カテゴリフィルタ無効化、既存の一括選択 checkbox を維持

## 非目的（YAGNI）

- 複数カテゴリの同時選択
- カテゴリの並び替え（現在はアルファベット順 sort のまま）
- カテゴリ単位のお気に入りフィルタ重ねがけ
- カテゴリレベルでの AI 設定切替（フィード単位の `aiEnabled` で十分）
- 独立した categories テーブルの導入（`feeds.category` 文字列のみで運用継続）

## テスト

- `articles-query.ts` のユニットテストに `category` パラメータの絞り込みケースを追加
  - `BLOG`（半角英字）
  - `COMPANY BLOG`（空白入り）
  - `未分類`（マルチバイト）
  - 空文字 / 前後空白のみ → 未指定相当
  - `feedId` と `category` 同時指定 → `feedId` 優先
- `EXPLAIN QUERY PLAN` で list / count いずれも `idx_articles_sort` および `idx_feeds_category` 相当の利用が確認できることを実装時に検証
- mark-all-read の category パラメータが該当行のみ更新することを確認
- mark-all-read で `feedId` と `category` 両方送ると 400 が返ることを確認
- UI: 手動で BLOG カテゴリを選択して該当フィードのみが記事一覧に並ぶこと、未読数が一致すること、全て既読でその範囲のみ既読化されること、rename / 削除後の選択状態が破綻しないことを確認

## 影響範囲

| ファイル | 変更内容 |
|---------|---------|
| `src/lib/articles-query.ts` | `category` パラメータ追加, SQL を feed-id サブクエリ方式に統一 |
| `src/app/api/articles/route.ts` | クエリパラメータ受け取り + trim 正規化 |
| `src/app/api/articles/mark-all-read/route.ts` | body schema 拡張 + feedId/category 排他バリデーション |
| `src/app/feeds/page.tsx` | `selectedCategory` state, 排他クリア, loadArticles/markAllRead 拡張, rename/削除後の同期 useEffect |
| `src/components/feeds/FeedSidebar.tsx` | カテゴリヘッダ分割、選択ハイライト、未読数表示、rename UI をペンシルボタンへ移行 |
| `__tests__/*` | category 絞り込み・正規化・mark-all-read のテスト追加 |
