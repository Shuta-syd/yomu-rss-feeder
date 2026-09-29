# Desktop article arrow shortcuts — 2026-09-12

Deployed to proxmox-yomu-rss-vm:/opt/yomu with explicit user authorization. Left/right arrows select previous/next loaded articles using the existing displayed-group order. Mobile, editing controls, dialogs, modifiers, composition, repeats and handled events are excluded. At loaded-list boundaries the existing pagination controls remain available.

Only src/app/feeds/page.tsx and src/lib/article-shortcuts.ts were transferred. The production page differed from local only by this shortcut change. No migrations or configuration changes. All four established Compose files were retained.

Backup: /opt/yomu-backups/20260912-arrow-shortcuts/source-before.tar.gz; rollback image yomu:before-arrow-shortcuts. Current running image: sha256:f9b44885d1cd0e5c9d708e7c5b74414c15aa34a1d318325763cb543ea8d01cad.

Validation: eight navigation/shortcut tests passed, typecheck and targeted ESLint passed; production Next.js and script builds passed. Compose wait succeeded for app, worker and browser. Public /api/health returned 200. Both deployed source hashes match local files; app is running healthy on the newly built image. Authenticated production keyboard interaction has not been verified.

Reusable check: compare production source before transferring a dirty working-tree file; preserve the existing Compose overrides and verify the running image after recreation.
