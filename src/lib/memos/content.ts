import { createHash } from "node:crypto";
export function memoId(articleId: string, origin: string, user: string) {
  return "yomu-" + createHash("sha256").update(JSON.stringify([origin, user, articleId])).digest("hex").slice(0, 30);
}
export function contentVersion(content: string) { return createHash("sha256").update(content).digest("hex"); }
export function connectionId(origin: string, user: string) { return contentVersion(JSON.stringify([origin,user])); }
export function normalizeOrigin(raw: string) {
  const url = new URL(raw);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/") throw new Error("HTTPSのMemosルートURLを入力してください。");
  return url.origin;
}
