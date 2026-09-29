/** Display-only cleanup. The stored source remains available unchanged. */
export function isNikkeiArticle(url: string): boolean {
  try { const u = new URL(url); return u.hostname === 'www.nikkei.com' && u.pathname.startsWith('/article/'); }
  catch { return false; }
}

export function cleanArticleDocument(doc: Document, url: string): void {
  doc.body.querySelectorAll('script,style,nav,form,[role="navigation"]').forEach(node => node.remove());
  if (!isNikkeiArticle(url)) return;
  const markers = /^(?:こちらもおすすめ[（(]自動検索[）)]|すべての記事が読み放題(?:有料会員が初回1カ月無料)?)$/;
  for (const node of doc.body.querySelectorAll('p,h2,h3')) {
    if (node.closest('blockquote,pre,code,table')) continue;
    if (!markers.test((node.textContent ?? '').replace(/\s/g, ''))) continue;
    const range = doc.createRange();
    range.setStartBefore(node);
    range.setEnd(doc.body, doc.body.childNodes.length);
    range.deleteContents();
    break;
  }
}
