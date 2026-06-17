# Yomu

AI搭載のセルフホスト型RSSリーダー。Gemini / OpenAI / Anthropic でフィード記事の要約・翻訳を生成できる。

## 特徴

- **AI要約・翻訳** — 2段階処理 (自動要約 + 詳細翻訳)、ストリーミング表示対応
- **マルチLLM** — Gemini / OpenAI (GPT-4o系) / Anthropic (Claude) を混在運用可能
- **全文取得** — RSSが抜粋のみの場合、Readabilityで元記事から全文抽出
- **OPML対応** — インポート/エクスポート
- **PWA** — ホーム画面追加、Web Pushで新着通知
- **認証** — UID (10桁数字) + パスワード、セッションcookie
- **UI** — 3カラムレイアウト、ライト/ダーク切替、記事ビュー幅のドラッグリサイズ
- **セルフホスト** — Docker ComposeでWeb/worker分離運用

## 技術スタック

- Next.js 16 (App Router) / React 19 / TypeScript 5.7
- SQLite (WAL) + Drizzle ORM + FTS5全文検索
- Tailwind CSS 4 + next-themes
- node-cron (5分tick) のworkerで自動取得
- Vitest (97テスト)

## 起動

Docker Compose中心の運用。Makefileで一発起動できる。

### 開発 (dev コンテナ)

```bash
make dev       # コンテナ起動 + pnpm install + db migrate + dev server (デーモン)
make logs      # 開発サーバーのログ表示
make shell     # コンテナに入る
make down      # 停止
```

http://localhost:3000 で起動。初回アクセスで `/setup` に誘導される。

### 本番

```bash
make prod-up       # docker-compose.yml でビルド・起動
make prod-logs
make prod-down
```

### 必須環境変数

```bash
ENCRYPTION_KEY=<64桁のhex文字列>  # openssl rand -hex 32 で生成
VAPID_PUBLIC_KEY=<Web Push用>    # make vapid-keys で生成
VAPID_PRIVATE_KEY=<Web Push用>
```

APIキー (Gemini / OpenAI / Anthropic) は初回セットアップ後、設定画面で登録する。AES-256-GCMで暗号化保存される。

ローカルネットワーク上のフィードURLを取得したい場合のみ、`ALLOW_PRIVATE_FEED_URLS=true` を設定する。未設定時はSSRF対策として private / loopback / link-local 宛のURLを拒否する。

### RSS同期の運用設定

本番Docker Composeでは、Web応答を担当する `app` とRSS同期/AI処理を担当する `worker` を分けて起動する。`app` 側では自動同期を起動せず、重いJSDOM解析やLLM処理でWeb応答が詰まるのを避ける。

障害時に自動同期を止める場合は `YOMU_AUTO_SYNC_ENABLED=false` を設定して再起動する。この設定は `worker` にだけ適用され、Web UI/APIはそのまま起動する。

```bash
YOMU_AUTO_SYNC_ENABLED=true
YOMU_SYNC_MAX_DURATION_MS=480000
YOMU_SYNC_LOCK_TIMEOUT_MS=600000
YOMU_MAX_FEED_ITEMS=200
YOMU_MAX_FULL_CONTENT_FETCHES_PER_FEED=20
YOMU_MAX_ITEM_HTML_CHARS=200000
YOMU_STAGE1_PENDING_LIMIT=50
```

## 主要ディレクトリ

```
src/
├── app/                   # Next.js App Router
│   ├── api/               # REST API
│   ├── feeds/             # メインUI
│   └── settings/          # 設定画面 (タブ式)
├── components/            # UIコンポーネント
└── lib/
    ├── llm/               # LLMプロバイダ抽象化 (gemini/openai/anthropic)
    ├── rss/               # フィード取得・同期・OPML
    ├── db/                # Drizzle スキーマ
    └── auth.ts            # UID + パスワード認証
```

詳細設計は [docs/yomu-v1-design.md](docs/yomu-v1-design.md) を参照。

## セルフホストデプロイ (Proxmox等)

1コマンドで環境構築・自動デプロイcron設定まで完了:

```bash
# サーバー側 (root or sudo)
curl -fsSL https://raw.githubusercontent.com/<user>/yomu-rss-feeder/main/scripts/setup.sh | bash
```

または clone してから:

```bash
git clone https://github.com/<user>/yomu-rss-feeder.git /opt/yomu
cd /opt/yomu
./scripts/setup.sh
```

`setup.sh` は以下を実行:
- Docker / git インストール (未導入時)
- `/opt/yomu` に clone
- `.env` 自動生成 (ENCRYPTION_KEY、VAPID鍵)
- `docker compose up -d --build`
- 5分おきに `git pull` + 再ビルドする cron を登録

以降、ローカルで `git push` するだけでサーバー側に自動反映されます。

### 手動デプロイ

```bash
cd /opt/yomu
./scripts/deploy.sh   # 変更があれば pull + rebuild
```

## 開発コマンド

```bash
make test       # vitest run
make typecheck  # tsc --noEmit
make lint       # eslint
make check      # lint + typecheck + test
make db-studio  # Drizzle Studio
```
