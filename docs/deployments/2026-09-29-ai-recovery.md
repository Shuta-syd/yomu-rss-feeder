# AI classification recovery — 2026-09-29

## Cause and correction

The displayed 1,801 failures were persisted classification/summary failures, not feed retrieval or Jev search errors. Historical errors included 1,090 malformed responses, 647 provider credit/cap failures, and transient/other errors. Failed rows are not automatically selected by the pending worker.

- Gemini structured JSON output now specifies the classification/summary schema. Real Gemini 3.1 Flash Lite accepted it and successfully recovered an old malformed-output failure.
- Retry transient 500/502/503/504 once; do not retry quota errors. Stop a batch on provider-wide authorization/quota/server errors so the remaining rows stay pending.
- Authenticated POST /api/ai/retry queues at most 10 failed rows atomically; pending work returns 409. Existing worker budget checks remain in force. Existing manual classification merging is preserved.
- Status UI identifies historical AI work, displays safe cause counts and offers an explicitly priced retry action. Feed page polling carries cause counts through to the panel.
- Schema-less request cache keys remain compatible, avoiding unnecessary paid regeneration of existing detailed summaries.

## Recovery and cost boundary

Three of four production probes recovered old failures. One old-code probe returned transient 503. The schema-enabled batch recovered another 166 articles; all 166 attempts succeeded. It stopped conservatively before the next two-attempt reservation would exceed its 9-yen cap. Probe plus batch recorded estimate: approximately 8.2276875 yen. This is application accounting, not a provider invoice; failed unknown-token calls retain conservative reservations.

Total recovered: 169. Remaining failed rows at verification: 1,632. No full-backlog retry was authorized by a budget selection, so the remainder was left for bounded explicit retries. Existing application budgets were not increased.

Snapshots of affected AI fields and batch result are stored in the production data volume under /data/ai-recovery-20260929 (private permissions). The current release backup is /opt/yomu-backups/20260929-ai-recovery, with source/config archive and runtime fingerprints; previous full DB backups remain retained.

## Validation

327 tests in 55 files passed, including old cache compatibility, schema forwarding, transient retry, quota stop, authenticated bounded queue and safe status aggregation. ESLint, TypeScript production build and worker compilation passed. Independent review found no remaining blockers. Final four-line polling integration was rebuilt and browser verified.

Mobile 390px browser fixture showed all four cause labels, retry notice, and no horizontal overflow. Fixture counts are synthetic. Network-disabled isolated final image smoke used a tmpfs DB: health/login 200, correct cause counts, 3 queued, repeated queue 409, unauthenticated retry 401. Earlier smoke setup failures were fixture mistakes (key length and error wording), corrected before deployment.

Final code revision: 5f216bc55cd84567a28b26b44217e2ac232eb3eb. Image yomu:ai-recovery-v2. Rollback yomu:before-ai-recovery-20260929. No production migration or dependency changes.

## Production verification

App and worker were recreated with all four existing Compose files and became healthy. Image digest sha256:39e3b74d8c3d9dbcdec5c483d77f730758de260bc51ea6cdd5a0825a97fdfa21. Failed count remained 1,632 after deployment. Environment fingerprints, mounts and DNS unchanged; browser/cloudflared container IDs unchanged. Public curl probes returned health 200, login 200, unauthenticated retry 401. Python urllib probes received an edge 403; curl reached the application correctly.

## Cleanup

Pending explicit deletion approval: the yomu-ai-recovery and yomu-jev-titles worktrees and branches, synthetic previews on 3392/3391, exited yomu-ai-recovery-verify containers and yomu-title-verify. Preserve backups, production DB, rollback images, and configuration. Current previews and local QA data are retained.

## Follow-up: user requested zero remaining failures

The user subsequently requested that the remaining 1,632 failures be cleared by recovery. Reprocessed them with the deployed schema-aware provider, without raising the existing daily 300-yen/monthly 3,000-yen caps. Three concurrent operations recovered 1,629 articles; the conservative reservation for an unusually long article then reached the remaining daily allowance. A disconnected SSH monitoring session did not interrupt the container process; its continuing execution was verified before any further action.

The final three inputs were approximately 266k, 532k and 350k characters. A bounded one-off recovery used 12 evenly distributed 2,000-character excerpts for their one-line summaries and classifications. The prompt explicitly identified the excerpts and prohibited inventing missing details. This is not a full-text summary guarantee. Original article bodies were retained. These three calls cost a recorded 0.810525 yen and respected the same provider budget checks.

Final DB verification: all 1,632 targeted IDs are done, none missing, no manual_classification values changed; failed/pending/processing counts all zero. Global done count 27,160 and skipped count 31,122 (previously skipped articles were not part of the failures). Public health returned 200. The recorded usage increase during the recovery window was 249.08625 yen, including any concurrent normal AI processing; daily recorded total 282.357636 yen, below 300 yen. These are application estimates, not provider invoice amounts.

Private before snapshots, runner result and final verified.json remain under /data/ai-recovery-20260929/all-*/; scripts are retained in /opt/yomu-backups/20260929-ai-recovery/. No application code change or redeployment was needed for this follow-up. Existing cleanup remains pending explicit deletion approval.
