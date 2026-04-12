#!/bin/sh
set -e

echo "[yomu] Running database migrations..."
node dist/migrate.js

echo "[yomu] Resetting stale processing states..."
node dist/reset-stale.js

echo "[yomu] Starting server..."
exec node server.js
