import { JSDOM, VirtualConsole } from "jsdom";
import { Readability } from "@mozilla/readability";
import { sanitizeHtml, htmlToPlain } from "../sanitize";

const silentConsole = new VirtualConsole();
silentConsole.on("error", () => {});
silentConsole.on("warn", () => {});
silentConsole.on("jsdomError", () => {});

const FETCH_TIMEOUT = 15_000;
const MAX_HTML_SIZE = 2 * 1024 * 1024; // 2MB

/**
 * 元記事URLからフルコンテンツを取得する。
 * RSSが抜粋のみの場合に使用。
 */
export async function fetchFullContent(
  url: string,
): Promise<{ contentHtml: string; contentPlain: string; thumbnailUrl: string | null } | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "yomu-rss-reader/1.0 (+https://github.com/yomu)",
        Accept: "text/html",
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
      redirect: "follow",
    });

    if (!res.ok) return null;

    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html")) return null;

    const html = await res.text();
    if (html.length > MAX_HTML_SIZE) return null;

    const dom = new JSDOM(html, { url, virtualConsole: silentConsole });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();
    if (!article?.content) return null;

    const sanitized = sanitizeHtml(article.content);
    const plain = htmlToPlain(sanitized);

    // 本文が短すぎる場合はパース失敗とみなす
    if (plain.length < 100) return null;

    // サムネイル抽出: OGP → 本文内最初のimg → null
    let thumbnailUrl: string | null = null;

    // 1. OGP画像
    const ogImage = dom.window.document.querySelector('meta[property="og:image"]');
    const ogUrl = ogImage?.getAttribute("content") ?? null;
    // Cloudinary transformation URLなど巨大URLは除外（401になりがち）
    if (ogUrl && ogUrl.length < 500 && !ogUrl.includes("/l_text:")) {
      thumbnailUrl = ogUrl;
    }

    // 2. フォールバック: 本文内の最初のimg
    if (!thumbnailUrl) {
      const imgMatch = sanitized.match(/<img[^>]+src=["']([^"']+)["']/i);
      if (imgMatch?.[1] && imgMatch[1].startsWith("http")) {
        thumbnailUrl = imgMatch[1];
      }
    }

    return { contentHtml: sanitized, contentPlain: plain, thumbnailUrl };
  } catch {
    return null;
  }
}
