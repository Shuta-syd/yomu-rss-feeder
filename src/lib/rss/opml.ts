import { JSDOM } from "jsdom";

export interface OpmlEntry {
  url: string;
  title: string;
  category: string;
}

export function parseOpml(xml: string): OpmlEntry[] {
  const dom = new JSDOM(xml, { contentType: "text/xml" });
  const doc = dom.window.document;
  const entries: OpmlEntry[] = [];

  function walk(el: Element, parentCategory: string) {
    for (const child of Array.from(el.children)) {
      if (child.tagName.toLowerCase() !== "outline") continue;
      const xmlUrl = child.getAttribute("xmlUrl");
      const title =
        child.getAttribute("title") ??
        child.getAttribute("text") ??
        "";
      if (xmlUrl) {
        entries.push({
          url: xmlUrl.trim(),
          title: title.trim() || xmlUrl,
          category: parentCategory,
        });
      } else {
        // カテゴリフォルダ outline
        const nextCategory = title.trim() || parentCategory;
        walk(child, nextCategory);
      }
    }
  }

  const body = doc.querySelector("body");
  if (body) walk(body, "未分類");
  return entries;
}
