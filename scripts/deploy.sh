#!/bin/bash
# Yomu 自動デプロイスクリプト
# cronから5分おきに実行される想定。git pullで変更を検知したら再ビルド&再起動。

set -euo pipefail

INSTALL_DIR="${INSTALL_DIR:-/opt/yomu}"
BRANCH="${BRANCH:-main}"

cd "$INSTALL_DIR"

# 最新のリモート状態を取得
git fetch origin "$BRANCH"

LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse "origin/$BRANCH")

if [ "$LOCAL" = "$REMOTE" ]; then
  # 変更なし
  exit 0
fi

echo "[$(date -Iseconds)] 変更検知: $LOCAL -> $REMOTE"

# pull & rebuild
git pull origin "$BRANCH"
if [ -f .env ] && grep -q "^CLOUDFLARE_TUNNEL_TOKEN=..*" .env; then
  docker compose --profile tunnel up -d --build
else
  docker compose up -d --build
fi

echo "[$(date -Iseconds)] デプロイ完了"
