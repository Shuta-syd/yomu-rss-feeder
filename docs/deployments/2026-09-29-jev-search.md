# Jev article search

Implementation branch: `feat/jev-search` in `/home/shuta/Workspace/worktrees/yomu-jev-search`.
Baseline `a10d630` preserves the existing dirty working tree from `main` (`29eae3c`).
Do not deploy or merge only the Jev diff onto `29eae3c`: it depends on the existing uncommitted features captured in this baseline.
The original checkout is untouched (260 file hashes checked against the start-of-task manifest).

## Behavior

- Settings → AI: encrypted TypeSafe API key and persistent Jev search toggle (default OFF).
- Explicit Enter/search-button submission. Stage1 expands the query; weighted substring retrieval across title, translated title, summary, tags and body retrieves up to 100 candidates. Existing filters apply before the cap.
- Jev `jev-1.13.0` judges each candidate against the query. Scores >= 2 on a 0–3 rubric are retained and sorted by relevance. UI shows the candidate coverage limit.
- Five-minute, bounded process-local cache stores IDs/scores, not full article copies. Pagination is scoped to query/configuration and uses stable ranking positions while rechecking current read/save filters.
- Search failures are explicit. Users can switch that search to ordinary FTS; no silent fallback. Cursor expiry has a restart action. Background polling does not rerank paid searches.
- Both expansion and Jev are metered through the existing budget. Concurrency, deadlines and response validation bound provider work. Provider errors do not expose credentials/upstream bodies.
- No new DB migration required. QA setup removes Jev credentials and enablement as well as existing provider keys.

## Validation

- Existing baseline: 282 tests passed.
- Final suite: 311 tests passed across 53 files, including encrypted settings, filters, candidate retrieval, relevance order, pagination after read changes, expiration, duplicate requests, missing/malformed responses, budget exhaustion, auth, limits, keyword fallback, cancellation and reservation cleanup.
- TypeScript and production build passed.
- Full-project ESLint passed without warnings. Independent code review findings were resolved and rechecked.
- Local browser at 127.0.0.1:3392: save/reload toggle and key, no key echo, missing-provider error, normal-search recovery, desktop and 390px layout.
- Controlled browser API fixtures: relevance order preserved even when dates differ; expired next-page response → restart → successful next page, without stale error. These fixtures are not Jev accuracy evidence.

## Production deployment (2026-09-29)

Merged into `main` and pushed to origin. Application revision: `5c5b950d66d290c2e976221f90332caf34e6946d`.
Image: `yomu:jev-5c5b950-verified`, `sha256:2dcea1c00f6bac707aff50dd4e64d43d3208c94ecee6bf98b71ebcb95aa6055b`.
Public service: https://yomu-rss.my-house.tokyo.

Production-only DNS configuration was preserved and committed. All four Compose files were retained, including `/opt/yomu-backups/20260911-ui/startup-applied-migrations.yml`. Web/worker environment-value hashes, mount paths and DNS were unchanged. Browser and Cloudflare containers were not recreated. No migrations or production credentials were changed. 58,214 articles and 21 feeds remained present after deployment.

Validation: full 311-test suite on the merged application revision; isolated production-image HTTP smoke covering health, setup/login, authenticated settings save/read, Jev toggle and redacted key, keyword fallback, missing-provider failure and unauthorized 401. Final public health/login returned 200; unauthenticated settings/search returned 401. Web healthy and worker running on the new image.

### Deployment incidents and recovery

DB backup and validation created high disk wait on the HDD-backed VM; the existing Web health timed out. The build was cancelled, backup validation moved off-host, and the old Web container restarted, restoring HTTP 200. No infrastructure settings were changed.

To avoid another server-side compile, locally verified Next standalone/static and worker artifacts were layered onto the prior production runtime with unchanged dependencies. An initial packaging attempt dereferenced `.next/node_modules` symlinks, causing an instrumentation `Cannot find module bindings` error and HTTP 500. It was rolled back to the preserved old image. Packaging was corrected to preserve symlinks and the corrected image passed full HTTP smoke in an isolated network-disabled container before redeployment. Final production health was rechecked successfully. Reuse rule: preserve standalone dependency symlinks and verify HTTP startup, not just a top-level native-module import, before switching traffic.

### Backups

- Server: `/opt/yomu-backups/20260929-jev-search/` holds source/config archive (including original `.env`, access restricted), DB snapshot, runtime fingerprints, deployment logs and artifact bundles.
- Rollback image retained: `yomu:before-jev-20260929`.
- Local DB copy: `/home/shuta/Workspace/backups/yomu-20260929-jev/database-before.db`, directory 0700, file 0600.
- Snapshot: 2,561,425,408 bytes, 58,214 articles, 21 feeds, SQLite `quick_check = ok` (verified on the PC to avoid HDD load).
- DB SHA-256: `254c87f9db2186e6d32328070ac81b0a4285251ecb466499601f8eba50004f25`.
- Original local working state retained in baseline `a10d630` and stash `5b90aae4176c911cc6971aa74137010f6ab51a87`.

### Still pending

The production Jev key is unconfigured and the toggle remains OFF. No real Jev calls or real-article relevance/latency evaluation have been made. Register a TypeSafe key in Settings → AI → Jev検索, then validate queries such as 面接について against relevant paraphrases and unrelated recruitment news before relying on the initial score threshold.

### Cleanup completed after explicit user approval (2026-09-29)

Rechecked the current branch, remote main, tracked/untracked/ignored files, active processes and local container parent bind mounts before removal. No new source changes or other work references were found. All task commits were already merged into main.

- Stopped the local preview at 127.0.0.1:3392, then verified no remaining task processes. Preserved all seven QA config/data files in `/home/shuta/Workspace/backups/yomu-20260929-jev/preview-config-data.tar.gz` with SHA-256 manifest verification, private directory/file permissions.
- Removed `/home/shuta/Workspace/worktrees/yomu-jev-search` using non-forced `git worktree remove`, and local `feat/jev-search` using `git branch -d`. Verified directory/registration/branch absence and that the preview port is closed.
- Stopped and removed server container `yomu-jev-verify` without `-v`. Preserved its anonymous volume `a4965c63a68115621f0c0957f3215f1298409722ef15198ca1fb50bc3d7be862`, since data-volume removal was outside the approval. Its private inspect record is saved in `/opt/yomu-backups/20260929-jev-search/preview-container-before-removal.json`.
- Removed only failed image tag `yomu:jev-5c5b950`. Kept the deployed image, verified image tag and rollback image.
- Revalidated the complete local production DB backup SHA-256 before deleting `uncompressed-transfer.partial`. Kept all complete production backups, QA backup, deployment archives/logs, and the original-work backup stash.
- Production Web remained healthy and public health returned HTTP 200 after cleanup.
