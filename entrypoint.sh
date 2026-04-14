#!/bin/sh
set -e

echo "[yomu] Running database migrations..."
node dist/migrate.js

echo "[yomu] Resetting stale processing states..."
node dist/reset-stale.js

echo "[yomu] Starting server (dev mode workaround for Next.js 16 prerender bug)..."
exec pnpm next dev --hostname 0.0.0.0 --port 3000
