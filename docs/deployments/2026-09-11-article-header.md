# 2026-09-11 article header and font control

Removed the wide-pane rule that placed every action beside the title and squeezed long headlines. Titles now retain the full detail width; actions wrap below the title and metadata, with consistent 34px desktop / 44px coarse-pointer hit areas. Read-later wrapper padding is scoped away inside this toolbar. Translation and memo actions use concise text. Programmatically focusing the noninteractive heading no longer draws an input-like outline; interactive control focus indicators remain.

An expandable Aa / 文字サイズ control exposes the existing five-level font control in the article header. It shares the existing articleFontSize key and CSS variable with settings, affects article prose immediately, and survives article changes. Defaults and previously saved choices are preserved. Storage failures no longer prevent an in-session size change.

Verification: TypeScript, targeted ESLint, seven font-size tests, diff whitespace checks passed. Browser fixture at 1440px verified full-width headline, actions below it, and 34px buttons. At 390px with touch emulation, buttons are 44px and there is no horizontal overflow. Selecting 13px changed the computed paragraph font and persisted to the next article. Screenshots /tmp/yomu-header-desktop.png and /tmp/yomu-header-mobile.png inspected; QA script /tmp/yomu-header-ui-check.mjs uses fixture articles and avoids AI requests. No physical Safari test.

Local dev initially served a stale compiled global stylesheet even after restart and bypassing service-worker/browser caches. Stopping the owned QA dev process, moving .next/dev to /tmp/yomu-next-dev-before-header and restarting regenerated correct CSS. Verify computed styles and returned CSS rather than equating changed source with a changed browser view.

Production source matched the pre-change local SHA256. Backup /opt/yomu-backups/20260911-article-header/source-before.tar.gz; rollback image yomu:before-article-header. Three runtime files transferred, no migrations, credentials or Compose changes. Use all four established Compose files. Working-tree deployment without commit/push.

Deployed image sha256:c90c6933354fd6a8ced115b883440dc30ba9ed8c41a1bc4bc8e1639442113dc9. Production build and script build passed, app and worker running, Compose checks passed. Public health returned 200, and the CSS served by the public /feeds page contains both the new action layout and font panel. All three transferred source hashes match local files. Authenticated article UI was checked locally, not on production.
