# 記事リストの日付セクションヘッダ 設計書

## 背景

記事リストは `sortKey DESC` で並んでいるが、日付ヘッダがないため「これらは今日の記事か」「いつから昨日か」が分かりにくい。スクリーンショットでも `10:22` `10:10` ... `07:31` と続いて、日が変わるとどこで切り替わったか視認できない。

## 仕様

### グルーピング

`sortKey` から派生したローカル日付 (YYYY-MM-DD) を**グループキー**とし、同一キーの連続記事を 1 グループとして扱う。グループの直前に日付ヘッダ行を挿入する。

`sortKey` を使うのは記事の並び順そのものに対応するため (publishedAt と createdAt のフォールバック関係を継承)。

### ラベル

`formatDateHeader(ms, now)` が文字列を返す:

- `now` と同じ日: `"今日"`
- `now` の前日: `"昨日"`
- それ以前 (今年): `"M月D日(曜)"` 例: `"5月15日(木)"`
- 前年以前: `"YYYY年M月D日(曜)"` 例: `"2025年12月31日(水)"`

「今日」「昨日」の判定はローカルタイムの 0:00 起算。曜日は `["日","月","火","水","木","金","土"]`。

### スタイル

```css
position: sticky;
top: 0;
z-index: 1; /* 行より上、ツールバー (固定でない) と並ぶ */
background: var(--sidebar-bg);
color: var(--muted);
padding: 6px 16px;
font-size: 12px;
font-weight: 600;
```

下線として薄い `border-bottom: 1px solid var(--card-border)` を入れて記事行と分離。

### Sentinel との関係

末尾の IntersectionObserver センチネル `<li>` は日付グルーピングと独立。常に最後に描画される。

### 無限スクロールとの整合

追加ページがロードされて articles が伸びると、render 関数が末尾でグループキーを引き継ぐ。前ページ末尾と新ページ先頭が同日なら新ヘッダは出ない。日が変わる位置で新ヘッダが現れる。

### モジュール構造

純粋関数を `src/lib/article-date.ts` に切り出してテスト容易に:

```ts
export function dateKey(ms: number): string;          // "YYYY-MM-DD" (local)
export function formatDateHeader(ms: number, now: number): string;
```

`ArticleList` 内で `articles.map` の代わりに、前の記事との dateKey 差分を見てヘッダ `<li>` を挿入する逐次走査ロジックを書く。

## テスト

`__tests__/lib/article-date.test.ts`:

- `dateKey`: 同じ日の 0:00 と 23:59 が同じキー / 翌 0:00 で別キー
- `formatDateHeader`:
  - 今日 → "今日"
  - 昨日 → "昨日"
  - 一昨日 → "M月D日(曜)"
  - 前年 → "YYYY年M月D日(曜)"
  - 月またぎ・年またぎの境界

UI レベルは手動確認:
- リスト先頭に「今日」ヘッダが付く
- スクロールしてヘッダが上に貼り付く
- 「今日」→「昨日」の境界で sticky がスムーズに切り替わる
- 無限スクロールで追加ロード後も日付グルーピングが正しい

## 非目的 (YAGNI)

- 日付ヘッダの折りたたみ
- 日付ジャンプ UI
- カレンダーピッカー連動

## 影響範囲

| ファイル | 変更内容 |
|---------|---------|
| `src/lib/article-date.ts` (新規) | `dateKey`, `formatDateHeader` |
| `__tests__/lib/article-date.test.ts` (新規) | 上記の単体テスト |
| `src/components/articles/ArticleList.tsx` | render を逐次走査に変更、日付ヘッダ `<li>` 挿入、sticky スタイル |
