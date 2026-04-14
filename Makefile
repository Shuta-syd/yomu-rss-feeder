COMPOSE_DEV  = docker compose -f docker-compose.dev.yml
COMPOSE_PROD = docker compose -f docker-compose.yml -f docker-compose.prod.yml
APP_SERVICE  = app

# コンテナ内でコマンドを実行 (non-TTY)
RUN = $(COMPOSE_DEV) exec -T $(APP_SERVICE)

.PHONY: up down dev install build test test-watch lint typecheck check \
        db-generate db-migrate db-push db-studio \
        prod-build prod-up prod-down prod-logs \
        shell clean vapid-keys help

# ==============================================================================
# 開発環境 (docker-compose.dev.yml)
# ==============================================================================

up: ## devコンテナ起動
	$(COMPOSE_DEV) up -d --build

down: ## devコンテナ停止
	$(COMPOSE_DEV) down

shell: ## devコンテナにシェルで入る
	$(COMPOSE_DEV) exec $(APP_SERVICE) zsh

install: ## pnpm install (コンテナ内)
	$(RUN) pnpm install

dev: ## devコンテナ起動 → install → migrate → 開発サーバー起動 (デーモン)
	$(COMPOSE_DEV) up -d --build
	$(RUN) pnpm install
	$(RUN) pnpm drizzle-kit push --force
	$(RUN) sh -c 'nohup pnpm dev > /tmp/next-dev.log 2>&1 &'
	@echo ""
	@echo "  開発サーバー起動: http://localhost:3000"
	@echo "  ログ確認:        make logs"
	@echo "  停止:            make down"

logs: ## 開発サーバーのログ表示
	$(RUN) tail -f /tmp/next-dev.log

build: ## プロダクションビルド (コンテナ内)
	$(RUN) pnpm build
	$(RUN) pnpm build:scripts

# ==============================================================================
# 品質チェック (コンテナ内)
# ==============================================================================

test: ## テスト実行
	$(RUN) pnpm test

test-watch: ## テスト (watchモード)
	$(RUN) pnpm test:watch

lint: ## ESLint
	$(RUN) pnpm lint

typecheck: ## 型チェック
	$(RUN) pnpm typecheck

check: lint typecheck test ## lint + typecheck + test を一括実行

# ==============================================================================
# データベース (コンテナ内)
# ==============================================================================

db-generate: ## Drizzle マイグレーションSQL生成
	$(RUN) pnpm db:generate

db-migrate: ## マイグレーション実行
	$(RUN) pnpm db:migrate

db-push: ## スキーマをDBに直接反映 (開発用)
	$(RUN) pnpm drizzle-kit push --force

db-studio: ## Drizzle Studio 起動
	$(RUN) pnpm db:studio

# ==============================================================================
# 本番 (docker-compose.yml)
# ==============================================================================

prod-build: ## 本番イメージビルド
	$(COMPOSE_PROD) build

prod-up: ## 本番コンテナ起動 (必要ならビルドも実行)
	$(COMPOSE_PROD) up -d --build

prod-down: ## 本番コンテナ停止
	$(COMPOSE_PROD) down

prod-logs: ## 本番ログ表示
	$(COMPOSE_PROD) logs -f

# ==============================================================================
# ユーティリティ
# ==============================================================================

vapid-keys: ## VAPID鍵ペア生成
	$(RUN) npx web-push generate-vapid-keys

clean: ## ビルド成果物削除 (コンテナ内)
	$(RUN) rm -rf .next dist tsconfig.tsbuildinfo

help: ## このヘルプを表示
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'

.DEFAULT_GOAL := help
