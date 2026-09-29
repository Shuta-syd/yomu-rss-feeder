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

## Production result

- Application revision `73fd6386612a42601b78e50778b69075f57d3e22` merged to main, pushed, and deployed to app/worker with all four existing Compose files (including browser and applied-migration override).
- Image `yomu:titles-73fd638`, digest `sha256:6a08e4debdd1e8cb876ff9925497e7d7cabb91f91dc9705cf4c46a63bd1be67b`. Rollback tag `yomu:before-title-20260929` retained.
- Isolated image smoke used a tmpfs synthetic DB and network-disabled provider fixture: health/login 200, 1,050 scoped titles advanced with 202 then completed with 200, invalid job 409, normal search 200, unauthenticated search 401. Container `yomu-title-verify` exited successfully; no production data mounted.
- Production app/worker healthy. Public health/login 200 and unauthenticated search 401. Environment fingerprints, mounts and DNS unchanged; browser/cloudflared container IDs unchanged.
- Actual Jev verification via bundled search module inside deployed app: FoundX scope 51 titles, query 面接について, 51 title judgments, 0 body candidates, 0 results, 342ms, recorded cost ¥0.0410571. Identical cached call added ¥0.
- Actual second verification: 炭鉱のカナリア、炭鉱の龍 scope 10 articles, query 金融市場について, 10 title judgments and 10 body judgments, 10 results, 882ms, recorded cost ¥0.0993384. Identical cached call added ¥0. These are small-scope functional observations, not full-corpus latency/cost or relevance-quality evaluation.
- All-article paid search was not executed for verification. No original article content/status was rewritten and no failed classification jobs were bulk retried.
- Private source/config backup and runtime fingerprints: `/opt/yomu-backups/20260929-title-search/`. Prior DB snapshot is retained under the previous release backup; no new schema migration or destructive DB operation was required.

## Cleanup pending approval

Task worktree `/home/shuta/Workspace/worktrees/yomu-jev-titles`, branch `feat/jev-title-search`, local synthetic preview on 127.0.0.1:3391, and exited synthetic verification container `yomu-title-verify` can be removed after explicit approval. Preserve release/rollback images and all production backups/data. Local QA config/data will be backed up before removal.
