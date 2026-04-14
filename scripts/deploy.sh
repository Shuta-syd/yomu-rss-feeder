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
docker compose up -d --build

echo "[$(date -Iseconds)] デプロイ完了"
