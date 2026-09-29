import {beforeAll,beforeEach,describe,it,expect,vi} from 'vitest';
import {NextRequest} from 'next/server';
import {createTestDb} from '../../helpers/test-db';
let testDb:ReturnType<typeof createTestDb>;
const capture=vi.hoisted(()=>vi.fn());
vi.mock('@/lib/db',()=>({get rawDb(){return testDb.raw}}));
vi.mock('@/lib/browser/connection',()=>({captureBrowserArticle:capture}));
vi.mock('@/lib/api-helpers',()=>({withAuth:async(fn:()=>Promise<unknown>)=>fn(),jsonError:(status:number,error:string)=>Response.json({error},{status})}));
import {POST} from '@/app/api/articles/[id]/browser-import/route';
import {BrowserImportError} from '@/lib/browser/article-import';
beforeAll(()=>{testDb=createTestDb()});
beforeEach(()=>{
 testDb.raw.exec("DELETE FROM app_config; DELETE FROM article_browser_imports; DELETE FROM articles; DELETE FROM feeds; INSERT INTO feeds(id,title,url,created_at) VALUES('f','Nikkei','https://example.com/feed',1); INSERT INTO articles(id,feed_id,title,url,dedup_hash,sort_key,created_at,content_html,content_plain,ai_summary_full,ai_stage2_status) VALUES('a','f','Test','https://www.nikkei.com/article/ABC/','hash',1,1,'<p>old</p>','old','old summary','done');");
 capture.mockReset();
});
const request=(origin='http://localhost')=>new NextRequest('http://localhost/api/articles/a/browser-import',{method:'POST',headers:{origin,host:'localhost'}});
const ctx={params:Promise.resolve({id:'a'})};
describe('browser import endpoint',()=>{
 it('uses the browser-facing host when Next normalizes the internal URL',async()=>{
  capture.mockRejectedValue(new BrowserImportError('ログインしてください'));
  const req=new NextRequest('http://localhost:3391/api/articles/a/browser-import',{method:'POST',headers:{origin:'http://127.0.0.1:3391',host:'127.0.0.1:3391'}});
  expect((await POST(req,ctx)).status).toBe(422);
 });
 it('persists the imported body and keeps the first original backup on repeated imports',async()=>{
  capture.mockResolvedValue({contentHtml:'<p>new body</p>',contentPlain:'new body'});
  const r=await POST(request(),ctx);expect(r.status).toBe(200);
  const a=(await r.json()).article;expect(a.contentPlain).toBe('new body');expect(a.aiSummaryFull).toBeNull();expect(a.aiStage1Status).toBe('pending');expect(a.browserImportedAt).toBeGreaterThan(0);
  testDb.raw.exec("UPDATE articles SET ai_stage1_status='done',ai_summary_short='new summary'");
  await POST(request(),ctx);
  expect(testDb.raw.prepare('SELECT ai_summary_short FROM articles').get()).toEqual({ai_summary_short:'new summary'});
  expect(testDb.raw.prepare('SELECT original_plain FROM article_browser_imports').get()).toEqual({original_plain:'old'});
 });
 it('does not overwrite content when the browser is logged out',async()=>{
  capture.mockRejectedValue(new BrowserImportError('ログインしてください'));
  expect((await POST(request(),ctx)).status).toBe(422);
  expect(testDb.raw.prepare('SELECT content_plain FROM articles').get()).toEqual({content_plain:'old'});
 });
 it('rejects cross-origin requests before accessing the browser',async()=>{
  expect((await POST(request('https://evil.example'),ctx)).status).toBe(403);expect(capture).not.toHaveBeenCalled();
 });
 it('does not replace content while an AI request is processing',async()=>{
  capture.mockResolvedValue({contentHtml:'new',contentPlain:'new'});
  testDb.raw.exec("UPDATE articles SET ai_stage2_status='processing'");
  expect((await POST(request(),ctx)).status).toBe(409);
  expect(testDb.raw.prepare('SELECT content_plain FROM articles').get()).toEqual({content_plain:'old'});
 });
});

it('returns an authentication handoff without changing the article',async()=>{
 testDb.raw.prepare("INSERT INTO app_config(key,value) VALUES('nikkei_auto_login',?)").run(JSON.stringify({enabled:true,state:'otp_required'}));
 capture.mockRejectedValue(new BrowserImportError('ログインしてください'));
 const response=await POST(request(),ctx);expect(response.status).toBe(422);expect((await response.json()).requiresAuthentication).toBe(true);
 expect(testDb.raw.prepare('SELECT content_plain FROM articles').get()).toEqual({content_plain:'old'});
});
