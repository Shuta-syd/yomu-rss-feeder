import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "../../helpers/test-db";
let testDb: ReturnType<typeof createTestDb>;
const chat=vi.hoisted(()=>vi.fn());
const fetchSafe=vi.hoisted(()=>vi.fn());
vi.mock("@/lib/url-safety",()=>({fetchSafeHttpUrl:fetchSafe}));
vi.mock("@/lib/api-helpers",()=>({withAuth:async (fn:()=>Promise<unknown>)=>fn(),jsonError:(status:number,message:string)=>new Response(message,{status})}));
import { fetchFeedWithOptions } from "@/lib/rss/fetcher";
import { PUT } from "@/app/api/feeds/[id]/route";
import { NextRequest } from "next/server";
vi.mock("@/lib/db",()=>({get db(){return testDb.db},get rawDb(){return testDb.raw}}));
vi.mock("@/lib/settings",()=>({getSettings:()=>({stage1Provider:"gemini",geminiModelStage1:"test"})}));
vi.mock("@/lib/llm/provider",async importOriginal=>({...await importOriginal<object>(),createProvider:()=>({chat})}));
import { LLMBudgetError } from "@/lib/llm/usage";
import { processStage1ForArticles } from "@/lib/llm/stage1";
beforeAll(()=>{testDb=createTestDb()});
beforeEach(()=>{testDb.raw.exec('DELETE FROM ai_result_cache; DELETE FROM articles; DELETE FROM feeds;');chat.mockReset()});
function seed(enabled:boolean){testDb.raw.prepare("insert into feeds(id,title,url,ai_enabled,created_at) values('f','feed','https://example.com',?,1)").run(+enabled);testDb.raw.exec("insert into articles(id,feed_id,title,url,dedup_hash,sort_key,created_at,ai_summary_short) values('a','f','Food robots','https://example.com/a','a',1,1,'existing')");}
const classification={genre:"テクノロジー",industries:["食品・農業"],topics:["ロボット・自動化"]};
describe('automatic article classification',()=>{
 it('keeps budget-blocked articles pending and resumes later without losing content',async()=>{
  seed(false);chat.mockRejectedValueOnce(new LLMBudgetError('予算上限'));
  await processStage1ForArticles(['a']);
  const a=testDb.raw.prepare('SELECT ai_stage1_status status,ai_summary_short summary FROM articles').get();
  expect(a).toEqual({status:'pending',summary:'existing'});
  chat.mockResolvedValue({content:JSON.stringify({classification})});
  await processStage1ForArticles(['a']);
  expect((testDb.raw.prepare('SELECT ai_stage1_status s FROM articles').get() as {s:string}).s).toBe('done');
 });
 it('queues newly fetched articles even when summary is off, without requeueing duplicates',async()=>{
   seed(false);
   fetchSafe.mockImplementation(async()=>({response:new Response('<rss version="2.0"><channel><title>News</title><link>https://example.com</link><item><guid>new</guid><title>Food robots</title><link>https://example.com/new</link><description>News</description></item></channel></rss>')}));
   const first=await fetchFeedWithOptions('f','https://example.com/feed',{maxFullContentFetches:0});
   expect(first.newArticles).toBe(1);
   expect((testDb.raw.prepare('select ai_stage1_status s from articles where id=?').get(first.newArticleIds![0]) as {s:string}).s).toBe('pending');
   expect((await fetchFeedWithOptions('f','https://example.com/feed',{maxFullContentFetches:0})).newArticles).toBe(0);
 });
 it('turning summary off keeps classification queued',async()=>{
   seed(true);
   await PUT(new NextRequest('http://localhost/api/feeds/f',{method:'PUT',body:JSON.stringify({aiEnabled:false})}),{params:Promise.resolve({id:'f'})});
   expect((testDb.raw.prepare('select ai_stage1_status s from articles').get() as {s:string}).s).toBe('pending');
 });
 it('classifies AI-disabled feeds without replacing summary and does not repeat completed work',async()=>{seed(false);chat.mockResolvedValue({content:JSON.stringify({classification}),inputTokens:10,outputTokens:10});await processStage1ForArticles(['a']);await processStage1ForArticles(['a']);const a=testDb.raw.prepare('select * from articles').get() as Record<string,unknown>;expect(a.ai_stage1_status).toBe('done');expect(a.ai_summary_short).toBe('existing');expect(JSON.parse(a.ai_tags as string)).toContain('業界:食品・農業');expect(chat).toHaveBeenCalledTimes(1);});
 it('generates summary and classification in one call',async()=>{seed(true);chat.mockResolvedValue({content:JSON.stringify({summary:'summary',tags:['AI'],titleJa:'食品ロボット',classification})});await processStage1ForArticles(['a']);const a=testDb.raw.prepare('select * from articles').get() as Record<string,unknown>;expect(a.ai_summary_short).toBe('summary');expect(JSON.parse(a.ai_tags as string)).toContain('業界:食品・農業');expect(chat).toHaveBeenCalledTimes(1);});
 it('rejects unsupported classification rather than claiming success',async()=>{seed(false);chat.mockResolvedValue({content:JSON.stringify({classification:{...classification,genre:'invented'}})});await processStage1ForArticles(['a']);expect((testDb.raw.prepare('select ai_stage1_status s from articles').get() as {s:string}).s).toBe('failed');});
});
