# Yomu RSS Feeder

## プロジェクト概要

シングルユーザー・セルフホストのAI搭載RSSリーダー。
Gemini / OpenAI / Anthropic による記事の自動要約・翻訳機能を提供する。

## 技術スタック

- Next.js 16 (App Router) + TypeScript 5.7
- SQLite (WAL mode) + Drizzle ORM + better-sqlite3
- Tailwind CSS 4
- Gemini / OpenAI / Anthropic
- node-cron (フィード定期取得、5分tick)
- Docker Compose (単一コンテナ)
- pnpm

## 設計メモ

- 全時刻は epoch ms (integer) で統一する。SQLite の datetime() や ISO 文字列は使わない
- テストは Vitest。重要領域は dedup, parse-response, sanitize, auth, articles-query
- 全 API エンドポイントは認証必須（/api/setup, /api/auth/login, /api/health を除く）
- LLM レスポンスは zod でバリデーションし、JSON パース失敗時は修復を試行する
- HTML サニタイズは DOMPurify hooks 方式を基本にする
- cursor pagination のソートキーは sortKey DESC, id DESC
- private / loopback / link-local 宛のフィードURLはデフォルト拒否。必要時のみ ALLOW_PRIVATE_FEED_URLS=true

## コミットルール

- 日本語でコミットする
- Claude/Codex の生成者署名は入れない
