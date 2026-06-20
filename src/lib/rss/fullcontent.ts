import { JSDOM, VirtualConsole } from "jsdom";
import { Readability } from "@mozilla/readability";
import { sanitizeHtml, htmlToPlain } from "../sanitize";
import { fetchSafeHttpUrl } from "../url-safety";
import { readResponseArrayBufferLimited } from "../http/read-limited";

const silentConsole = new VirtualConsole();
silentConsole.on("error", () => {});
silentConsole.on("warn", () => {});
silentConsole.on("jsdomError", () => {});

const FETCH_TIMEOUT = 15_000;
const MAX_HTML_SIZE = 2 * 1024 * 1024; // 2MB

export interface ReadablePage {
  finalUrl: string;
  title: string;
  byline: string | null;
  siteName: string | null;
  excerpt: string | null;
  lang: string | null;
  publishedTime: string | null;
  contentHtml: string;
  contentPlain: string;
  thumbnailUrl: string | null;
}

/**
 * HTTPヘッダ → HTML meta → UTF-8 の順に文字コードを検出してデコードする。
 * 日本語サイト (Shift_JIS / EUC-JP) のモジバケ対策。
 */
function decodeHtml(buf: ArrayBuffer, contentType: string): string {
  const fromHeader = /charset=([^;\s]+)/i.exec(contentType)?.[1]?.toLowerCase().replace(/["']/g, "");
  const tryDecode = (label: string): string | null => {
    try {
      return new TextDecoder(label, { fatal: false }).decode(buf);
    } catch {
      return null;
    }
  };
  if (fromHeader && fromHeader !== "utf-8") {
    const decoded = tryDecode(fromHeader);
    if (decoded) return decoded;
  }
  // 先頭2KBをlatin1としてサンプルし、<meta charset=...>を拾う
  const sample = new TextDecoder("latin1").decode(buf.slice(0, 2048));
  const fromMeta =
    /<meta[^>]+charset\s*=\s*["']?([a-zA-Z0-9_-]+)/i.exec(sample)?.[1]?.toLowerCase();
  if (fromMeta && fromMeta !== "utf-8") {
    const decoded = tryDecode(fromMeta);
    if (decoded) return decoded;
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(buf);
}

function resolveMaybeUrl(rawUrl: string | null | undefined, baseUrl: string): string | null {
  if (!rawUrl || rawUrl.length >= 500 || rawUrl.includes("/l_text:")) return null;
  try {
    return new URL(rawUrl, baseUrl).toString();
  } catch {
    return null;
  }
}

function absolutizeContentUrls(contentHtml: string, baseUrl: string): string {
  const dom = new JSDOM(`<!doctype html><body>${contentHtml}</body>`, {
    url: baseUrl,
    virtualConsole: silentConsole,
  });
  try {
    dom.window.document.querySelectorAll("a[href]").forEach((el) => {
      const href = resolveMaybeUrl(el.getAttribute("href"), baseUrl);
      if (href) el.setAttribute("href", href);
    });
    dom.window.document.querySelectorAll("img[src]").forEach((el) => {
      const src = resolveMaybeUrl(el.getAttribute("src"), baseUrl);
      if (src) el.setAttribute("src", src);
    });
    return dom.window.document.body.innerHTML;
  } finally {
    dom.window.close();
  }
}

function firstMetaContent(document: Document, selectors: string[]): string | null {
  for (const selector of selectors) {
    const content = document.querySelector(selector)?.getAttribute("content")?.trim();
    if (content) return content;
  }
  return null;
}

function extractThumbnail(document: Document, contentHtml: string, baseUrl: string): string | null {
  const ogImage = firstMetaContent(document, [
    'meta[property="og:image"]',
    'meta[property="og:image:url"]',
    'meta[name="twitter:image"]',
  ]);
  const resolvedOg = resolveMaybeUrl(ogImage, baseUrl);
  if (resolvedOg) return resolvedOg;

  const dom = new JSDOM(`<!doctype html><body>${contentHtml}</body>`, {
    url: baseUrl,
    virtualConsole: silentConsole,
  });
  try {
    const firstImage = dom.window.document.querySelector("img[src]")?.getAttribute("src");
    return resolveMaybeUrl(firstImage, baseUrl);
  } finally {
    dom.window.close();
  }
}

export async function fetchReadablePage(url: string): Promise<ReadablePage | null> {
  try {
    const { response: res, url: finalUrl } = await fetchSafeHttpUrl(url, {
      headers: {
        "User-Agent": "yomu-rss-reader/1.0 (+https://github.com/yomu)",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    });

    if (!res.ok) return null;

    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
      return null;
    }

    const buf = await readResponseArrayBufferLimited(res, MAX_HTML_SIZE);
    const html = decodeHtml(buf, contentType);

    const dom = new JSDOM(html, { url: finalUrl, virtualConsole: silentConsole });
    try {
      const reader = new Readability(dom.window.document, { charThreshold: 80 });
      const article = reader.parse();
      if (!article?.content) return null;

      const absoluteContent = absolutizeContentUrls(article.content, finalUrl);
      const sanitized = sanitizeHtml(absoluteContent);
      const plain = htmlToPlain(sanitized);

      if (plain.length < 80) return null;

      const documentTitle = dom.window.document.title.trim();
      const metaTitle = firstMetaContent(dom.window.document, [
        'meta[property="og:title"]',
        'meta[name="twitter:title"]',
      ]);
      const title = article.title?.trim() || metaTitle || documentTitle || finalUrl;
      const thumbnailUrl = extractThumbnail(dom.window.document, sanitized, finalUrl);

      return {
        finalUrl,
        title,
        byline: article.byline?.trim() || null,
        siteName: article.siteName?.trim() || null,
        excerpt: article.excerpt?.trim() || null,
        lang: article.lang?.trim() || null,
        publishedTime: article.publishedTime?.trim() || null,
        contentHtml: sanitized,
        contentPlain: plain,
        thumbnailUrl,
      };
    } finally {
      dom.window.close();
    }
  } catch {
    return null;
  }
}

/**
 * 元記事URLからフルコンテンツを取得する。
 * RSSが抜粋のみの場合に使用。
 */
export async function fetchFullContent(
  url: string,
): Promise<{ contentHtml: string; contentPlain: string; thumbnailUrl: string | null } | null> {
  const page = await fetchReadablePage(url);
  if (!page) return null;
  return {
    contentHtml: page.contentHtml,
    contentPlain: page.contentPlain,
    thumbnailUrl: page.thumbnailUrl,
  };
}
