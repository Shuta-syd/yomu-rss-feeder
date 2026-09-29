# Desktop list follows article selection

ArticleList now scrolls only its own container when the selected article is outside its viewport. Uses smooth scroll, respects reduced motion, leaves visible items alone, and runs only on desktop selection changes. Does not move focus or scroll the detail pane.

Deployed only ArticleList.tsx after comparing production source; the only difference was this effect. Backup: /opt/yomu-backups/20260912-list-follow/source-before.tar.gz. Rollback image: yomu:before-list-follow. No migrations/configuration changes; retained all four established Compose files.

Typecheck, targeted ESLint and production app/script builds passed. Running image: sha256:9738e49abb15e4f62b0b5f04ef9834000329a2086087b4a7977d0c72833cfed4. Compose wait passed, public health HTTP 200, deployed source SHA256 matches local. Interactive browser validation unavailable because the test browser profile was in use; no production UI interaction claimed.

Reusable rule: scroll the list container explicitly, not all scrollIntoView ancestors; avoid scroll effects on background article updates.
