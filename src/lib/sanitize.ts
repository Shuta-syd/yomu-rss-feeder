import createDOMPurify from "dompurify";
import { JSDOM, VirtualConsole } from "jsdom";

const silentConsole = new VirtualConsole();
silentConsole.on("error", () => {});
silentConsole.on("warn", () => {});
silentConsole.on("jsdomError", () => {});

const window = new JSDOM("", { virtualConsole: silentConsole }).window;
const DOMPurify = createDOMPurify(window as unknown as Window & typeof globalThis);

const ALLOWED_TAGS = [
  "p", "br", "strong", "em", "b", "i", "u", "s",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "ul", "ol", "li",
  "blockquote", "pre", "code",
  "a", "img",
  "table", "thead", "tbody", "tr", "th", "td",
  "figure", "figcaption",
  "hr", "sub", "sup",
];

const ALLOWED_ATTR = [
  "href", "title", "rel", "target",
  "src", "alt", "width", "height", "loading", "referrerpolicy",
  "class",
  "colspan", "rowspan",
];

let hookInstalled = false;

function ensureHook() {
  if (hookInstalled) return;
  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    if (!(node instanceof window.Element)) return;
    if (node.tagName === "A") {
      node.setAttribute("target", "_blank");
      node.setAttribute("rel", "noopener noreferrer");
    }
    if (node.tagName === "IMG") {
      node.setAttribute("loading", "lazy");
      node.setAttribute("referrerpolicy", "no-referrer");
    }
  });
  hookInstalled = true;
}

export function sanitizeHtml(dirty: string): string {
  ensureHook();
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    FORBID_TAGS: ["script", "style", "iframe", "object", "embed", "form", "input"],
    FORBID_ATTR: ["onerror", "onclick", "onload", "onmouseover"],
    WHOLE_DOCUMENT: false,
    RETURN_DOM: false,
  }) as unknown as string;
}

export function htmlToPlain(html: string): string {
  const doc = new JSDOM(`<!doctype html><body>${html}</body>`, { virtualConsole: silentConsole }).window.document;
  return (doc.body.textContent ?? "").replace(/\s+/g, " ").trim();
}
