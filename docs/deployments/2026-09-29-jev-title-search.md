# Jev title-first search

User authorized main integration and deployment after selecting title-first all-article relevance judgment, optionally scoped to category/feed.

## Behavior

- All titles in the selected scope reach Jev; no Gemini expansion, keyword shortlist, or top-100 candidate cutoff.
- Jev title scores >= 1 receive a second judgment using the title, available short summary and up to 2,400 body characters. Scores >= 2 appear in relevance order. Topics absent from a title or body excerpt may be missed.
- Requests process at most 16 batches. HTTP 202 includes a scope-bound continuation ID and actual title/body counts. Client polling advances work; cancel stops subsequent polls while the current bounded chunk may finish.
- Thirty-minute process-local retention (maximum 10 searches), including successful batches preceding a failure. Capacity rejects new searches rather than silently evicting paid work. Expired or unknown continuation IDs return 409 without starting paid work. New articles/changed text are incorporated on a new search after expiry.
- Existing AI budget reservations apply. Shared 60ms request spacing, 4 concurrent calls per search and 2 executing searches, per-call 15s timeout. Payloads contain only titles in stage 1; stage 2 only reads shortlisted article text.
- Pagination reuses judgments and hydrates only the requested page, with current read/save/deletion filters. Supports more than 100 matching results.
- Progress card, completed/total counts, cancel control, responsive skeleton list, reduced-motion support and scope label.

## Verification before deployment

- Baseline 311 tests passed. Final 320 tests in 54 files passed.
- Full ESLint, TypeScript production build and worker build passed.
- Independent review found unexpired cache eviction could repeat paid judgments; fixed with a failing-then-passing regression. Follow-up review found no deployment blockers.
- Local browser with synthetic data and controlled API fixtures: desktop 1360px and mobile 390px, title/body progress, completion, cancel stops polling, no horizontal overflow. This is UI validation, not model accuracy evidence.
- No production schema migration or dependency change. Build locally and preserve standalone symlinks when overlaying the existing runtime; verify isolated HTTP startup before switching app/worker.
