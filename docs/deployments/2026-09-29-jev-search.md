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

## Pending real-service validation and production rollout

No real TypeSafe key has been supplied or located in this task. No real Jev calls or relevance-quality/latency evaluation have been made; no production files or configuration have been changed.
Use a real TypeSafe key in Settings and the existing configured Stage1 provider to evaluate queries such as 面接について against representative articles, including relevant paraphrases and unrelated recruitment news. Adjust the threshold only using observed results. The default threshold is an initial rubric choice, not a measured accuracy guarantee.

Before rollout, preserve the production Compose overrides, especially the migration override under `/opt/yomu-backups/20260911-ui/startup-applied-migrations.yml` and `docker-compose.browser.yml`; do not run the generic deploy script blindly. Preserve DB and credentials. Keep the toggle OFF until actual validation is complete. No worktree or baseline deletion is appropriate while rollout remains pending.
