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

それ以外の挙動は既存のまま（更新後の row を返す）。

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

debounce 500ms の自動保存。`textarea` の onChange でローカル state を更新し、500ms 入力が止まったら `PATCH /api/articles/[id]` を投げる。保存中・保存済みのインジケータを下部に小さく出す。

```tsx
const [note, setNote] = useState(article.note ?? "");
const [savingState, setSavingState] = useState<"idle" | "saving" | "saved">("idle");
const lastSavedRef = useRef(article.note ?? "");

useEffect(() => {
  if (note === lastSavedRef.current) return;
  setSavingState("saving");
  const t = setTimeout(async () => {
    const res = await fetch(`/api/articles/${article.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note: note.trim() || null }),
    });
    if (res.ok) {
      const updated = await res.json();
      lastSavedRef.current = updated.note ?? "";
      setSavingState("saved");
      onChange?.(updated);
    } else {
      setSavingState("idle");
    }
  }, 500);
  return () => clearTimeout(t);
}, [note, article.id]);
```

#### 開閉状態の永続化

折りたたみのデフォルトは「メモが空のときは閉じる / 既存メモがあるときは自動的に開く」。localStorage 等での永続化はしない（記事ごとに自然な挙動）。

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
| `src/components/articles/ArticleDetail.tsx` | メモ折りたたみ UI + debounce 保存 |
| `src/components/articles/ArticleList.tsx` | 📝 インジケータ表示 |
| `__tests__/lib/article-note.test.ts` (新規) | API 正規化ロジックのテスト |
