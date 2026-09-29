# 2026-09-11 feed and AI update status

An initially collapsed update-status panel appears in the existing article list. It shows feed failures and AI configuration/budget holds in the summary, while per-feed timestamps, current result and retry controls are available when expanded. Feed timestamps use the existing lastFetchedAt, which records an attempt even on failure: successful feeds say last update, failures say last check. This is not a new last-success timestamp.

The status endpoint reads feeds only, without joining article content/unread counts, every 30 seconds while the page is visible. It maps upstream errors to readable messages and omits raw URLs/error bodies. Individual retry keeps the existing feedId API; failedOnly selects currently failed feeds on the server, skips healthy feeds and bypasses the normal fetch interval. It uses the existing sync lock. Malformed/conflicting retry bodies are rejected. The ordinary empty-body update remains supported. In-progress, aborted and network failure outcomes have feedback.

AI status distinguishes ordinary pending work, active work, failed articles, missing API keys, missing model prices and actual prior budget rejections. Budget waiting is based on pending articles' recorded LLMBudgetError message, not an estimate from remaining money. The UI explains that this is the previous budget decision; normal worker retries update the state. If error wording changes, update the matching SQL and tests together. While paused, the existing AI/article polling interval falls from five to thirty seconds. Reading status does not call an AI API; retrying RSS can queue new articles for the existing budget-controlled AI worker.

Validation:
- Full suite: 237 passing tests, plus three new sync endpoint tests passed (240 total).
- Final typecheck and targeted lint checked after the last edits; diff whitespace check checked.
- Desktop 1440px and mobile 390px screenshots inspected, without horizontal overflow.
- Browser tests used controlled responses: a failed feed and budget hold were visible, an individual retry sent only its feedId and cleared the failure upon recovery, and the bulk action sent failedOnly:true.
- UI tests did not initiate real external feed requests.

Target: proxmox-yomu-rss-vm:/opt/yomu. Backup source: /opt/yomu-backups/20260911-status/source-before.tar.gz. Rollback image: yomu:before-update-status. No database migrations or credential changes. Keep all four existing Compose files, including the browser and already-applied-migration overrides documented in prior deployment notes.

Deployed image: sha256:b528669200658487a3412d2122d1c424556f5744fbe3ba4441861bc6f136a06d. App, worker and browser passed Compose health checks. Public health returned 200, and the new status endpoint returned 401 while unauthenticated. The working-tree source was deployed directly, without a Git commit or push.
