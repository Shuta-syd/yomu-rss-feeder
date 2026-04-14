#!/bin/bash
# Yomu 初回セットアップスクリプト
# 用途: Proxmox LXC/VM等の新規環境に Yomu をセットアップする
# 使い方:
#   curl -fsSL https://raw.githubusercontent.com/<user>/yomu-rss-feeder/main/scripts/setup.sh | bash
# または clone 後:
#   ./scripts/setup.sh

set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/Shuta-syd/yomu-rss-feeder.git}"
INSTALL_DIR="${INSTALL_DIR:-/opt/yomu}"
BRANCH="${BRANCH:-main}"

echo "=== Yomu セットアップ開始 ==="
echo "Install先: $INSTALL_DIR"
echo

# --- 1. 前提: Docker確認 ---
if ! command -v docker >/dev/null 2>&1; then
  echo "[1/6] Dockerが見つかりません。インストールします..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker
else
  echo "[1/6] Docker: OK ($(docker --version))"
fi

if ! command -v git >/dev/null 2>&1; then
  echo "[1/6] gitをインストール..."
  if command -v apt >/dev/null 2>&1; then apt update && apt install -y git
  elif command -v dnf >/dev/null 2>&1; then dnf install -y git
  else echo "git を手動インストールしてください"; exit 1
  fi
fi

# --- 2. リポジトリclone or pull ---
if [ -d "$INSTALL_DIR/.git" ]; then
  echo "[2/6] 既存リポジトリ検出。pullで更新..."
  cd "$INSTALL_DIR"
  git pull origin "$BRANCH"
else
  echo "[2/6] リポジトリをcloneします..."
  git clone -b "$BRANCH" "$REPO_URL" "$INSTALL_DIR"
  cd "$INSTALL_DIR"
fi

# --- 3. .env 作成 ---
if [ ! -f "$INSTALL_DIR/.env" ]; then
  echo "[3/6] .env を生成..."
  ENCRYPTION_KEY=$(openssl rand -hex 32)

  # VAPID鍵生成 (Node.jsがあれば web-pushで生成、なければプレースホルダ)
  if command -v node >/dev/null 2>&1; then
    VAPID_KEYS=$(docker run --rm node:22-alpine sh -c "npm i -g web-push >/dev/null 2>&1 && web-push generate-vapid-keys --json")
    VAPID_PUBLIC=$(echo "$VAPID_KEYS" | sed -n 's/.*"publicKey":"\([^"]*\)".*/\1/p')
    VAPID_PRIVATE=$(echo "$VAPID_KEYS" | sed -n 's/.*"privateKey":"\([^"]*\)".*/\1/p')
  else
    VAPID_PUBLIC="TODO_RUN_MAKE_VAPID_KEYS"
    VAPID_PRIVATE="TODO_RUN_MAKE_VAPID_KEYS"
  fi

  # Cloudflare Tunnel Token (任意)
  echo "    Cloudflare Tunnel Token を入力してください (未使用ならEnterでスキップ):"
  read -r CLOUDFLARE_TUNNEL_TOKEN

  cat > "$INSTALL_DIR/.env" <<EOF
ENCRYPTION_KEY=$ENCRYPTION_KEY
VAPID_PUBLIC_KEY=$VAPID_PUBLIC
VAPID_PRIVATE_KEY=$VAPID_PRIVATE
CLOUDFLARE_TUNNEL_TOKEN=$CLOUDFLARE_TUNNEL_TOKEN
EOF
  echo "    .env を生成しました"
else
  echo "[3/6] .env は既に存在 (スキップ)"
fi

# --- 4. Dockerビルド & 起動 ---
echo "[4/6] Dockerイメージビルド & 起動..."
cd "$INSTALL_DIR"
# CLOUDFLARE_TUNNEL_TOKENが設定されていればtunnelプロファイルも起動
if grep -q "^CLOUDFLARE_TUNNEL_TOKEN=..*" .env; then
  docker compose --profile tunnel up -d --build
else
  docker compose up -d --build
fi

# --- 5. 自動デプロイ用cron登録 ---
DEPLOY_SCRIPT="$INSTALL_DIR/scripts/deploy.sh"
if [ -f "$DEPLOY_SCRIPT" ]; then
  CRON_ENTRY="*/5 * * * * $DEPLOY_SCRIPT >> /var/log/yomu-deploy.log 2>&1"
  if ! crontab -l 2>/dev/null | grep -qF "$DEPLOY_SCRIPT"; then
    echo "[5/6] cron登録 (5分ごとの自動デプロイ)..."
    (crontab -l 2>/dev/null; echo "$CRON_ENTRY") | crontab -
  else
    echo "[5/6] cron登録済み (スキップ)"
  fi
else
  echo "[5/6] deploy.sh が見つからないので cron登録スキップ"
fi

# --- 6. 完了 ---
echo
echo "=== セットアップ完了 ==="
echo
echo "  URL:        http://$(hostname -I | awk '{print $1}'):3000"
echo "  データ:      $INSTALL_DIR/data/"
echo "  ログ確認:    docker compose -f $INSTALL_DIR/docker-compose.yml logs -f"
echo "  停止:        docker compose -f $INSTALL_DIR/docker-compose.yml down"
echo
echo "初回アクセスで /setup に誘導されます。生成されたUIDを控えてください。"
