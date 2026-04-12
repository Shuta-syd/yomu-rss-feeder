#!/bin/bash
# yomu バックアップスクリプト — ホスト側 cron で日次実行想定
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/app/data/backups}"
DB_PATH="${DB_PATH:-/app/data/yomu.db}"
RETAIN_DAYS="${RETAIN_DAYS:-7}"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
mkdir -p "$BACKUP_DIR"

# SQLite online backup (WAL対応、ロック不要)
sqlite3 "$DB_PATH" ".backup '${BACKUP_DIR}/yomu_${TIMESTAMP}.db'"

find "$BACKUP_DIR" -name 'yomu_*.db' -mtime +"$RETAIN_DAYS" -delete

echo "[yomu] Backup complete: ${BACKUP_DIR}/yomu_${TIMESTAMP}.db"
