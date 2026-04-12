cat > CLAUDE.md << 'EOF'
# Yomu RSS Feeder

## プロジェクト概要
シングルユーザー・セルフホストのAI搭載RSSリーダー。
Gemini APIによる記事の自動要約・翻訳機能を提供する。

## 技術スタック
- Next.js 16.2 (App Router) + TypeScript 5.7
- SQLite (WAL mode) + Drizzle ORM + better-sqlite3
- Tailwind CSS 4 + shadcn/ui + next-themes
- Gemini API (固定、v1ではマルチプロバイダ不要)
- node-cron (フィード定期取得、5分tick固定)
- Docker Compose (単一コンテナ)
- pnpm

## 設計書
詳細設計は docs/design.md を参照。

## コーディング規約
- 全時刻は epoch ms (integer) で統一。SQLiteの datetime() やISO文字列は使わない
- テストはVitest。P0: dedup, parse-response, sanitize, auth
- 全APIエンドポイントは認証必須（/api/setup, /api/auth/login を除く）
- LLMレスポンスはzodでバリデーション。JSONパース失敗時は修復を試行
- HTMLサニタイズはDOMPurify hooks方式（string replace禁止）
- cursor paginationのソートキーは sortKey DESC, id DESC

## コミットルーk
-にほんごでこみっとする
- CLAUDE めっせーじいれない