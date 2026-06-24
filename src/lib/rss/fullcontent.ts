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

export type ReadablePageFailureReason =
  | "fetch_error"
  | "http_error"
  | "unsupported_content_type"
  | "not_readable"
  | "too_short";

export type ReadablePageResult =
  | { ok: true; page: ReadablePage }
  | {
      ok: false;
      reason: ReadablePageFailureReason;
      message: string;
      finalUrl?: string;
      status?: number;
      contentType?: string;
    };

interface ExtractedArticle {
  content: string;
  title: string | null;
  byline: string | null;
  siteName: string | null;
  excerpt: string | null;
  lang: string | null;
  publishedTime: string | null;
}

function readableFailure(
  reason: ReadablePageFailureReason,
  message: string,
  detail: Omit<Extract<ReadablePageResult, { ok: false }>, "ok" | "reason" | "message"> = {},
): ReadablePageResult {
  return { ok: false, reason, message, ...detail };
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

function normalizeText(text: string | null | undefined): string {
  return (text ?? "").replace(/\s+/g, " ").trim();
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

function removeNonContentNodes(root: ParentNode) {
  root
    .querySelectorAll(
      "script, style, noscript, template, iframe, object, embed, nav, footer, form, input, button, select, textarea, svg",
    )
    .forEach((el) => el.remove());
}

function textLengthWithoutLinks(element: Element): number {
  const total = normalizeText(element.textContent).length;
  let linkTextLength = 0;
  element.querySelectorAll("a").forEach((link) => {
    linkTextLength += normalizeText(link.textContent).length;
  });
  return Math.max(0, total - linkTextLength);
}

function findFallbackContentElement(document: Document): Element | null {
  const selectors = [
    "article",
    "main",
    '[role="main"]',
    '[itemprop="articleBody"]',
    ".entry-content",
    ".post-content",
    ".article-content",
    ".content",
    "body",
  ];
  const candidates = selectors
    .flatMap((selector) => Array.from(document.querySelectorAll(selector)))
    .filter((element, index, all) => all.indexOf(element) === index);

  let best: Element | null = null;
  let bestScore = 0;
  for (const element of candidates) {
    const textLength = normalizeText(element.textContent).length;
    const nonLinkTextLength = textLengthWithoutLinks(element);
    const linkDensity = textLength === 0 ? 1 : 1 - nonLinkTextLength / textLength;
    const score = nonLinkTextLength - linkDensity * 100;
    if (score > bestScore) {
      best = element;
      bestScore = score;
    }
  }

  return bestScore >= 80 ? best : null;
}

function extractWithReadability(document: Document): ExtractedArticle | null {
  const readerDocument = document.cloneNode(true) as Document;
  const article = new Readability(readerDocument, { charThreshold: 80 }).parse();
  if (!article?.content) return null;

  return {
    content: article.content,
    title: article.title?.trim() || null,
    byline: article.byline?.trim() || null,
    siteName: article.siteName?.trim() || null,
    excerpt: article.excerpt?.trim() || null,
    lang: article.lang?.trim() || null,
    publishedTime: article.publishedTime?.trim() || null,
  };
}

function extractWithFallback(document: Document, baseUrl: string): ExtractedArticle | null {
  const contentElement = findFallbackContentElement(document);
  if (!contentElement) return null;

  const contentDom = new JSDOM(`<!doctype html><body>${contentElement.innerHTML}</body>`, {
    url: baseUrl,
    virtualConsole: silentConsole,
  });
  try {
    removeNonContentNodes(contentDom.window.document.body);
    const content = contentDom.window.document.body.innerHTML;
    if (!content) return null;
    const plain = htmlToPlain(sanitizeHtml(absolutizeContentUrls(content, baseUrl)));
    if (plain.length < 80) return null;

    const h1 = normalizeText(document.querySelector("h1")?.textContent);
    const metaTitle = firstMetaContent(document, [
      'meta[property="og:title"]',
      'meta[name="twitter:title"]',
    ]);
    const metaDescription = firstMetaContent(document, [
      'meta[name="description"]',
      'meta[property="og:description"]',
      'meta[name="twitter:description"]',
    ]);
    const siteName = firstMetaContent(document, ['meta[property="og:site_name"]']);
    const lang = document.documentElement.getAttribute("lang")?.trim() || null;
    const publishedTime = firstMetaContent(document, [
      'meta[property="article:published_time"]',
    ]) ?? document.querySelector("time[datetime]")?.getAttribute("datetime")?.trim() ?? null;

    return {
      content,
      title: metaTitle || h1 || null,
      byline: null,
      siteName,
      excerpt: metaDescription,
      lang,
      publishedTime,
    };
  } finally {
    contentDom.window.close();
  }
}

export async function fetchReadablePageResult(url: string): Promise<ReadablePageResult> {
  try {
    const { response: res, url: finalUrl } = await fetchSafeHttpUrl(url, {
      headers: {
        "User-Agent": "yomu-rss-reader/1.0 (+https://github.com/yomu)",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    });

    if (!res.ok) {
      return readableFailure("http_error", `HTTP ${res.status}`, {
        finalUrl,
        status: res.status,
        contentType: res.headers.get("content-type") ?? undefined,
      });
    }

    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
      return readableFailure("unsupported_content_type", "Response is not HTML", {
        finalUrl,
        contentType,
      });
    }

    const buf = await readResponseArrayBufferLimited(res, MAX_HTML_SIZE);
    const html = decodeHtml(buf, contentType);

    const dom = new JSDOM(html, { url: finalUrl, virtualConsole: silentConsole });
    try {
      const article =
        extractWithReadability(dom.window.document) ??
        extractWithFallback(dom.window.document, finalUrl);
      if (!article?.content) {
        return readableFailure("not_readable", "Readable content was not found", {
          finalUrl,
          contentType,
        });
      }

      const absoluteContent = absolutizeContentUrls(article.content, finalUrl);
      const sanitized = sanitizeHtml(absoluteContent);
      const plain = htmlToPlain(sanitized);

      if (plain.length < 80) {
        return readableFailure("too_short", "Extracted content is too short", {
          finalUrl,
          contentType,
        });
      }

      const documentTitle = dom.window.document.title.trim();
      const metaTitle = firstMetaContent(dom.window.document, [
        'meta[property="og:title"]',
        'meta[name="twitter:title"]',
      ]);
      const title = article.title || metaTitle || documentTitle || finalUrl;
      const thumbnailUrl = extractThumbnail(dom.window.document, sanitized, finalUrl);

      return {
        ok: true,
        page: {
          finalUrl,
          title,
          byline: article.byline,
          siteName: article.siteName,
          excerpt: article.excerpt,
          lang: article.lang,
          publishedTime: article.publishedTime,
          contentHtml: sanitized,
          contentPlain: plain,
          thumbnailUrl,
        },
      };
    } finally {
      dom.window.close();
    }
  } catch (e) {
    return readableFailure("fetch_error", e instanceof Error ? e.message : String(e));
  }
}

export async function fetchReadablePage(url: string): Promise<ReadablePage | null> {
  const result = await fetchReadablePageResult(url);
  return result.ok ? result.page : null;
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
