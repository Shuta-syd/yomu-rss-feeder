#!/bin/sh
set -e

if [ "${YOMU_RUN_MIGRATIONS:-true}" = "true" ]; then
  echo "[yomu] Running database migrations..."
  node dist/scripts/migrate.js

  echo "[yomu] Resetting stale processing states..."
  node dist/scripts/reset-stale.js
else
  echo "[yomu] Skipping database migrations."
fi

if [ "$#" -gt 0 ]; then
  echo "[yomu] Starting command: $*"
  exec "$@"
fi

echo "[yomu] Starting server..."
exec node server.js
