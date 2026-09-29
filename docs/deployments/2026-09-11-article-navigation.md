# 2026-09-11 article navigation

Article detail now ends with previous/next cards showing destination titles. The cards follow the current filtered list. Grouping state and groups are shared with ArticleList, so navigation from a representative or its related articles moves to adjacent groups. A removed open article uses the query's descending sortKey/ID position. At a pagination boundary, the reader can load another page without returning to the list, then select the next article. Errors offer an explicit retry; the list's automatic observer does not repeatedly retry a failed request.

Changing articles remounts the existing detail scroller at the top and focuses its heading. A delayed automatic read-mark response only updates the currently selected article if IDs still match, preventing a response for the previous article from taking the reader back. Note saving continues through the existing per-article saver. Navigation adds no AI calls.

Validation:
- 245 tests passed, including five new boundary/group/removed-item/date-tie cases.
- TypeScript, targeted ESLint and diff whitespace checks passed.
- Chrome browser checks at 390 x 844 and 1440 x 1000: first/last disabled states, grouped duplicate skipped, previous/next selection, scroll reset, heading focus, delayed read response, failed pagination and successful retry. No horizontal overflow. Zero AI endpoint calls in the fixture.
- Controlled browser fixtures were used for article data and PATCH/pagination responses; this is not physical iPhone/Safari verification.
- Screenshots inspected: /tmp/yomu-navigation-mobile.png and /tmp/yomu-navigation-desktop.png. QA runner: /tmp/yomu-navigation-ui-check.mjs, launched with local QA environment; no production login or credential changes.

Deployment:
- Source backup: /opt/yomu-backups/20260911-navigation/source-before.tar.gz.
- Rollback image: yomu:before-article-navigation.
- Modified production source files matched the local pre-change snapshot by SHA256 before replacement.
- No migrations. Retain all four established Compose files, including the browser and already-applied-migrations overrides.
- Only the changed source and test files were transferred. Production environment and Compose configuration were preserved.
- Working-tree deployment; no Git commit or push.

Reusable check: use the actual grouped list for navigation, keep delayed updates scoped by article ID, and test pagination failure as well as success. Browser assertions should target `article h1`, since the sidebar also contains an h1.

Deployed image: sha256:60759b1559d4e6201967813a9e027b58f390a844204ab29b0e5f376e2cfd3fb8. Production build and script build passed. All three services are running; app and browser have passing health checks (worker has no separate Docker health-check field). Public health returned 200 and unauthenticated articles returned 401. Browser discovery is connected and the saved Nikkei login state remains logged_in; article capture was not repeated. All six changed runtime source files matched local SHA256 after transfer. Authenticated UI validation was local, not on the production site.
