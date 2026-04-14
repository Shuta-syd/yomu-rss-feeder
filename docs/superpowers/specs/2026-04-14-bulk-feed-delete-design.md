# フィード一括削除 設計

## 目的
サイドバーで複数フィードを選択して一括削除できるようにする（OPMLインポート後の整理用途）。

## UI
サイドバー (`src/components/feeds/FeedSidebar.tsx`) に選択モードを追加。

- ヘッダに `選択` ボタン追加（↻ / ⎋ の隣）
- 選択モード ON 時:
  - 各フィード左に checkbox 表示（FeedIcon を置換）
  - カテゴリヘッダにも checkbox（カテゴリ内全フィードのトグル）
  - `すべて` の項目を `□ 全選択` に置換
  - フィードクリック = チェック切替（記事は開かない）
  - ドラッグ移動 / カテゴリリネーム / 折りたたみは一時無効
- サイドバー下部に固定アクションバー: `[キャンセル] [削除 (N)]`
- 削除ボタン → `confirm("N件のフィードを削除します。記事も全て消えます。よろしいですか？")` → API 呼び出し → 選択モード解除 + サイドバー＆記事リスト再読込

## API
`DELETE /api/feeds` を新設。

- Request body: `{ ids: string[] }` (1 件以上、最大 1000)
- zod でバリデーション
- `db.transaction(() => db.delete(feeds).where(inArray(feeds.id, ids)).run())`
- 記事は FK `ON DELETE CASCADE` で自動削除
- Response: `{ deleted: number }` (HTTP 200)

既存 `DELETE /api/feeds/[id]` は残す（個別削除導線として）。

## State 管理
`FeedSidebar` に local state:
- `selectMode: boolean`
- `selectedIds: Set<string>`

## エラー処理
- API 失敗時はトースト的に `alert()` で表示（既存パターン）
- 0 件選択時は削除ボタンを disabled
