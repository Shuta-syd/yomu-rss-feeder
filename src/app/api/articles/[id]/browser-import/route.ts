import {NextRequest,NextResponse} from 'next/server';
import {withAuth,jsonError} from '@/lib/api-helpers';
import {rawDb} from '@/lib/db';
import {rowToArticle} from '@/lib/articles-query';
import {captureBrowserArticle} from '@/lib/browser/connection';
import {getLoginSettings} from '@/lib/browser/login-settings';
import {BrowserImportError} from '@/lib/browser/article-import';
export async function POST(req:NextRequest,ctx:{params:Promise<{id:string}>}) {
  return withAuth(async()=>{
    // Mutating requests are only accepted from the Yomu page itself.
    let sameOrigin = false;
    try {
      const origin = new URL(req.headers.get('origin') ?? '');
      sameOrigin = origin.host === req.headers.get('host') && origin.protocol === req.nextUrl.protocol;
    } catch { /* Missing or malformed Origin is rejected. */ }
    if(!sameOrigin) return jsonError(403,'Yomuの記事画面から操作してください。');
    const {id}=await ctx.params;
    const existing=rawDb.prepare('SELECT * FROM articles WHERE id=?').get(id) as Record<string,unknown>|undefined;
    if(!existing)return jsonError(404,'記事が見つかりません');
    let content;
    try {content=await captureBrowserArticle(String(existing.url));}
    catch(e){if(e instanceof BrowserImportError)return NextResponse.json({error:e.message,requiresAuthentication:['otp_required','otp_invalid','otp_expired','manual_required'].includes(getLoginSettings().state)},{status:422});throw e;}
    const saved=rawDb.transaction(()=>{
      const current=rawDb.prepare('SELECT * FROM articles WHERE id=?').get(id) as Record<string,unknown>|undefined;
      if(!current)return false;
      if(current.browser_imported_at && current.content_html === content.contentHtml && current.content_plain === content.contentPlain) return true;
      if(current.ai_stage1_status==='processing'||current.ai_stage2_status==='processing')return false;
      rawDb.prepare(`INSERT INTO article_browser_imports(article_id,original_html,original_plain,imported_at) VALUES(?,?,?,?) ON CONFLICT(article_id) DO UPDATE SET imported_at=excluded.imported_at`).run(id,current.content_html,current.content_plain,Date.now());
      rawDb.prepare(`UPDATE articles SET content_html=?,content_plain=?,browser_imported_at=?,ai_summary_short=NULL,ai_stage1_status='pending',ai_stage1_error=NULL,ai_stage1_processed_at=NULL,ai_summary_full=NULL,ai_translation=NULL,ai_key_points=NULL,ai_related_links=NULL,ai_stage2_status='none',ai_stage2_error=NULL,ai_stage2_processed_at=NULL WHERE id=?`).run(content.contentHtml,content.contentPlain,Date.now(),id);
      return true;
    }).immediate();
    if(!saved)return jsonError(409,'AI処理が終わってから取り込みを再試行してください。');
    const row=rawDb.prepare('SELECT a.*,f.title AS feed_title FROM articles a LEFT JOIN feeds f ON f.id=a.feed_id WHERE a.id=?').get(id) as Record<string,unknown>;
    return NextResponse.json({article:rowToArticle(row),characters:content.contentPlain.length});
  });
}
