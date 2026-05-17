# 無限スクロール + 既読/未読フィルタ 設計書

## 背景

`/api/articles` は `nextCursor` を返してカーソルベースのページネーションに対応しているが、フロントエンド ([src/app/feeds/page.tsx:84-97](../../../src/app/feeds/page.tsx#L84-L97)) が `nextCursor` を無視して 50 件しか取得しない。PR TIMES に 33,837 件の未読があってもリストは 50 件で打ち止め。

また、現在は「お気に入りのみ」「すべて (既読・未読混在)」しかフィルタがなく、「未読のみ読みたい」「既読を再読したい」というニーズに応えられない。

## 目的

1. 記事リストで先頭ページの末尾までスクロールしたら自動的に次ページを取得する（無限スクロール）
2. 既読/未読の表示フィルタを「未読のみ / 既読のみ / 混在」の 3 状態で切替可能にする

## 仕様

### 既読フィルタ

新しい state `readFilter: 'unread' | 'read' | 'all'` をフロントに追加。デフォルトは `'all'` （既存挙動を変えない）。

API には既存の `isRead` パラメータを使う:

| readFilter | API パラメータ |
|-----------|---------------|
| `'unread'` | `isRead=false` |
| `'read'`   | `isRead=true`  |
| `'all'`    | （未指定）     |

UI: トップツールバーの「全て既読」ボタンの隣に 3 セグメントのトグルを置く。

```
[ 未読 | 既読 | 全て ]
```

選択中のセグメントは accent-subtle 背景でハイライト。コンパクトなボタングループ。モバイルでもラベルが収まる程度の幅。

### 無限スクロール

#### State 構造

```ts
const [articles, setArticles] = useState<ArticleDTO[]>([]);
const [nextCursor, setNextCursor] = useState<string | null>(null);
const [loadingMore, setLoadingMore] = useState(false);
const [initialLoading, setInitialLoading] = useState(false);
```

#### ロード関数の分割

`loadArticles` を 2 つに分ける。

```ts
const loadInitial = useCallback(async () => {
  setInitialLoading(true);
  const params = buildParams({ /* feedId/category/search/readFilter/starred */ });
  const res = await fetch(`/api/articles?${params}`);
  if (res.status === 401) { router.replace("/login"); return; }
  const data = await res.json();
  setArticles(data.articles);
  setNextCursor(data.nextCursor);
  setInitialLoading(false);
}, [/* deps */]);

const loadMore = useCallback(async () => {
  if (!nextCursor || loadingMore) return;
  setLoadingMore(true);
  const params = buildParams({ /* same filters */ });
  params.set("cursor", nextCursor);
  const res = await fetch(`/api/articles?${params}`);
  if (res.ok) {
    const data = await res.json();
    setArticles((prev) => [...prev, ...data.articles]);
    setNextCursor(data.nextCursor);
  }
  setLoadingMore(false);
}, [nextCursor, loadingMore, /* same filters */]);
```

`buildParams` は共通ヘルパとして抽出する。フィルタ条件が変わったら `useEffect` で `loadInitial` を呼び直し、その結果 `articles` と `nextCursor` がリセットされる。

#### IntersectionObserver でのトリガ

`ArticleList` 末尾にセンチネル要素 `<div ref={sentinelRef} />` を置き、ビューポートに入ったら `onLoadMore?.()` を呼ぶ。`ArticleList` の Props に `onLoadMore?: () => void` と `hasMore: boolean` と `loadingMore: boolean` を追加。

```tsx
function ArticleList({ articles, selectedId, onSelect, onLoadMore, hasMore, loadingMore }: Props) {
  const sentinelRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    if (!hasMore || !onLoadMore) return;
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) onLoadMore();
      },
      { rootMargin: "200px" }, // 末尾の 200px 手前で先読み
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, onLoadMore]);

  // ... existing render ...

  return (
    <ul className="h-full overflow-y-auto">
      {articles.map(...)}
      {hasMore && <li ref={sentinelRef} className="h-12 flex items-center justify-center text-xs" style={{ color: "var(--muted)" }}>
        {loadingMore ? "読み込み中..." : ""}
      </li>}
    </ul>
  );
}
```

`rootMargin: "200px"` でビューポート末尾 200px 手前で発火させ、ユーザがスクロールし切る前に次ページを取得してシームレスに見せる。

`hasMore` は `nextCursor !== null` の派生値として親で算出して渡す。

#### フィルタ変更時の挙動と競合対策

`selectedFeedId` / `selectedCategory` / `search` / `view` / `readFilter` のいずれかが変わったら `loadInitial` を呼ぶ。これらを deps に持つ `useEffect` で実装する。`loadInitial` の中で `setArticles([])` と `setNextCursor(null)` してから fetch するので、フィルタ切替時にリストはクリアされて先頭に戻る。

**競合対策**: フィルタ変更中に in-flight な `loadMore` が完了すると、古いフィルタの記事が新フィルタのリストに追記されてしまう。これを防ぐため、`useRef<AbortController | null>` を持ち、`loadInitial` / `loadMore` を呼ぶ前に既存の controller があれば `abort()` する。fetch には `signal` を渡し、AbortError は無視（state を更新しない）する。

```ts
const abortRef = useRef<AbortController | null>(null);

const loadInitial = useCallback(async () => {
  abortRef.current?.abort();
  const ctrl = new AbortController();
  abortRef.current = ctrl;
  // ... fetch with signal: ctrl.signal ...
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (ctrl.signal.aborted) return;
    // ... apply ...
  } catch (e) {
    if ((e as Error).name === "AbortError") return;
    throw e;
  }
}, [...]);
```

`loadMore` も同様。これで「フィルタ変更でリストクリア → 古い loadMore の応答が追記」のレースを潰す。

#### スクロール位置のリセット

既存のモバイルスクロール位置保持機能（コミット [78fc7a0]）と整合させる。フィルタ条件が変わったとき（カテゴリ・フィード・readFilter 切替）はスクロール位置を先頭に戻す。同じフィルタ条件のままページネーションが追記された場合はスクロール位置を保持する。

具体的には: `ArticleList` の `<ul>` に `ref` を持たせ、`articles[0]?.id` が変わった瞬間（先頭が入れ替わった = フィルタ変更）に `scrollTop = 0` する。追記のときは先頭が変わらないので影響なし。

### 既存機能との整合

- **「全て既読」ボタン**: クリック対象は API リクエスト（feedId / category スコープ）であって表示中のリストではない。`readFilter` には依存させない（既存挙動維持）。
- **お気に入りビュー** (`view === 'starred'`): `readFilter` と直交させる。「お気に入り中の未読のみ」も可能にする。
- **検索**: `readFilter` と併用可能。
- **AI status バナー**: 影響なし。

### スマホ挙動

3 セグメントトグルはツールバー内に並べる。「全て既読」ボタンと並べてもスマホ幅 (375px) で収まることを確認する。きついならボタンを「全」「未」「既」の 1 文字略記にする。

## 非目的

- ジャンプ to top ボタン（IntersectionObserver の負担増。次の課題）
- 仮想スクロール（react-window 等）。33k 件全部メモリに乗せると DOM が爆発するので将来必要だが、今回は無限スクロール＋未読フィルタで実用上は緩和される
- 既読の自動ロード抑制（既読フィルタで「未読のみ」を選べば実質同等）

## テスト

無限スクロールは UI 統合テストが重いので、ロジックの単体テストに分解する:

- `buildArticlesParams` ヘルパ（filter → URLSearchParams 変換）をテストする
  - readFilter='unread' → `isRead=false` が含まれる
  - readFilter='read' → `isRead=true` が含まれる
  - readFilter='all' → `isRead` が含まれない
  - cursor 引数があれば `cursor=...` が含まれる

UI 側は手動テスト:
- PR TIMES を選んでスクロールしてみて、リスト末尾に近づくと自動でロードが続くこと
- readFilter を切り替えると先頭が変わり、未読数が見え方と整合すること
- すべて既読 → 「未読のみ」モードでリストが空になること

## 影響範囲

| ファイル | 変更内容 |
|---------|---------|
| `src/lib/articles-params.ts` (新規) | `buildArticlesParams` ヘルパ抽出 |
| `__tests__/lib/articles-params.test.ts` (新規) | ヘルパの単体テスト |
| `src/app/feeds/page.tsx` | state 追加, `loadInitial` / `loadMore` 分割, useEffect の deps 整理 |
| `src/components/articles/ArticleList.tsx` | sentinel + IntersectionObserver, props 追加 (`onLoadMore`, `hasMore`, `loadingMore`) |
| `src/components/feeds/ReadFilterToggle.tsx` (新規) | 3 セグメントのトグルボタン |
