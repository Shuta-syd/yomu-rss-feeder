export interface ExportFeed {
  title: string;
  url: string;
  siteUrl: string | null;
  category: string;
}

/** XML属性値に使用できるよう特殊文字をエスケープする */
function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * フィード一覧からOPML 2.0形式のXMLを生成する。
 * カテゴリごとにグルーピングし、カテゴリはアルファベット順にソートする。
 */
export function generateOpml(feeds: ExportFeed[]): string {
  // カテゴリ → フィードのMapを構築
  const categoryMap = new Map<string, ExportFeed[]>();
  for (const feed of feeds) {
    const list = categoryMap.get(feed.category);
    if (list) {
      list.push(feed);
    } else {
      categoryMap.set(feed.category, [feed]);
    }
  }

  // カテゴリをソート
  const sortedCategories = Array.from(categoryMap.keys()).sort((a, b) =>
    a.localeCompare(b),
  );

  // カテゴリごとのoutline要素を生成
  const categoryOutlines = sortedCategories
    .map((category) => {
      const feedOutlines = (categoryMap.get(category) ?? [])
        .map((feed) => {
          const htmlUrlAttr = feed.siteUrl
            ? ` htmlUrl="${escapeXml(feed.siteUrl)}"`
            : "";
          return `      <outline type="rss" text="${escapeXml(feed.title)}" title="${escapeXml(feed.title)}" xmlUrl="${escapeXml(feed.url)}"${htmlUrlAttr}/>`;
        })
        .join("\n");
      return `    <outline text="${escapeXml(category)}">\n${feedOutlines}\n    </outline>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>Yomu RSS Feeder Subscriptions</title>
  </head>
  <body>
${categoryOutlines}
  </body>
</opml>`;
}
