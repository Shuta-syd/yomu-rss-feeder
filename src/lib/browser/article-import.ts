import { sanitizeHtml, htmlToPlain } from '../sanitize';

export class BrowserImportError extends Error {}

export function matchingArticleUrl(a: string, b: string): boolean {
  try {
    const left = new URL(a), right = new URL(b);
    return [left, right].every(u => u.protocol === 'https:' && u.hostname === 'www.nikkei.com' && /^\/article\/[A-Z0-9]+\/$/.test(u.pathname))
      && left.pathname === right.pathname;
  } catch { return false; }
}

export function validateBrowserCapture(value: unknown, expectedUrl: string) {
  const capture = value as {url?: unknown; html?: unknown; blocked?: unknown} | null;
  if (!capture || typeof capture.url !== 'string' || !matchingArticleUrl(capture.url, expectedUrl)) {
    throw new BrowserImportError('対象と同じ日経の記事を連携用Chromeで開いてください。');
  }
  if (capture.blocked !== false) throw new BrowserImportError('日経にログインし、記事の本文を最後まで表示してから取り込んでください。');
  if (typeof capture.html !== 'string' || capture.html.length > 2_000_000) throw new BrowserImportError('本文を読み取れませんでした。');
  const contentHtml = sanitizeHtml(capture.html);
  const contentPlain = htmlToPlain(contentHtml);
  if (contentPlain.length < 80) throw new BrowserImportError('表示中の本文が短すぎます。記事を開き直してください。');
  return {contentHtml, contentPlain};
}

// Runs in the user's already open article tab. No cookies, network requests,
// application state, hidden JSON or authentication controls are accessed.
export const CAPTURE_EXPRESSION = `(() => {
  const visible = el => {
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const s = getComputedStyle(n);
      if (n.hidden || n.getAttribute('aria-hidden') === 'true' || s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') return false;
    }
    return el.getClientRects().length > 0;
  };
  const article = document.querySelector('article');
  const body = article && article.querySelector('[data-track-article-content]');
  const gate = article && [...article.querySelectorAll('[class*="paywall"],[class*="Paywall"]')].some(el => visible(el) && /ログインする|会員登録する|続きを読/.test(el.innerText));
  if (!body || gate) return {url:location.href, blocked:true};
  const clone = body.cloneNode(true);
  const sourceNodes = [...body.querySelectorAll('*')];
  const cloneNodes = [...clone.querySelectorAll('*')];
  sourceNodes.forEach((el, i) => {
    const copy = cloneNodes[i];
    if (!visible(el) || /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|FORM|NAV|IFRAME|BUTTON)$/.test(el.tagName)) {copy.remove();return;}
    if (el.tagName === 'IMG') {copy.setAttribute('src', el.currentSrc || el.src);copy.removeAttribute('srcset');}
    if (el.tagName === 'A') copy.setAttribute('href',el.href);
  });
  if (clone.innerHTML.length > 2000000) return {url:location.href,blocked:true};
  return {url:location.href,blocked:false,html:clone.innerHTML};
})()`;
