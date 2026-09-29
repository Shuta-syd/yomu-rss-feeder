import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {NextRequest} from 'next/server';
import {createTestDb} from '../helpers/test-db';
let testDb:ReturnType<typeof createTestDb>;
const chat=vi.hoisted(()=>vi.fn());
vi.mock('@/lib/db',()=>({get db(){return testDb.db},get rawDb(){return testDb.raw}}));
vi.mock('@/lib/api-helpers',()=>({withAuth:async(fn:()=>Promise<unknown>)=>fn(),jsonError:(status:number,error:string)=>Response.json({error},{status})}));
vi.mock('@/lib/settings',()=>({getSettings:()=>({stage1Provider:'gemini',geminiModelStage1:'test'})}));
vi.mock('@/lib/llm/provider',async original=>({...await original<object>(),createProvider:()=>({chat})}));
import {PATCH} from '@/app/api/articles/[id]/route';
import {processStage1ForArticles} from '@/lib/llm/stage1';
import {listArticles} from '@/lib/articles-query';
const manual={genre:'経済・ビジネス',industries:['食品・農業'],topics:[]};
const ai={summary:'AI summary',tags:['Startup'],classification:{genre:'テクノロジー',industries:['IT・通信'],topics:['AI']}};
const patch=(data:unknown,id='a')=>PATCH(new NextRequest('http://localhost/api/articles/'+id,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}),{params:Promise.resolve({id})});
beforeEach(()=>{
 testDb=createTestDb();chat.mockReset();chat.mockResolvedValue({content:JSON.stringify(ai)});
 testDb.raw.exec("INSERT INTO feeds(id,title,url,ai_enabled,created_at) VALUES('f','Feed','https://example.com/feed',1,1); INSERT INTO articles(id,feed_id,title,url,content_plain,dedup_hash,sort_key,created_at,ai_tags,note) VALUES('a','f','News','https://example.com/a','News body','a',1,1,'[\"Other\",\"ジャンル:その他\"]','keep');");
});
afterEach(()=>testDb.close());
it('saves classification without AI calls, preserves notes and makes filters reflect it',async()=>{
 const r=await patch({classification:manual});expect(r.status).toBe(200);
 const a=await r.json();expect(JSON.parse(a.aiTags)).toEqual(['Other','ジャンル:経済・ビジネス','業界:食品・農業']);expect(a.manualClassification).toBeTruthy();expect(a.note).toBe('keep');expect(chat).not.toHaveBeenCalled();
 expect(listArticles({classifications:['業界:食品・農業']}).total).toBe(1);expect(listArticles({classifications:['ジャンル:その他']}).total).toBe(0);
});
it.each([{...manual,genre:'unknown'},{...manual,topics:['AI','AI','AI','AI']},null])('rejects invalid classification without changes',async classification=>{
 expect((await patch({classification})).status).toBe(400);expect(testDb.raw.prepare('SELECT ai_tags FROM articles').get()).toEqual({ai_tags:'["Other","ジャンル:その他"]'});
});
it('preserves manual edits made while AI is running',async()=>{
 let release!:(value:unknown)=>void;chat.mockImplementation(()=>new Promise(resolve=>{release=resolve}));
 const pending=processStage1ForArticles(['a']);
 await patch({classification:manual});release({content:JSON.stringify(ai)});await pending;
 const a=listArticles({}).articles[0]!;expect(JSON.parse(a.aiTags!)).toEqual(['Startup','ジャンル:経済・ビジネス','業界:食品・農業']);expect(a.aiSummaryShort).toBe('AI summary');
});
it('does not copy a manual correction to a duplicate through the AI cache',async()=>{
 await patch({classification:manual});await processStage1ForArticles(['a']);
 testDb.raw.exec("INSERT INTO articles(id,feed_id,title,url,content_plain,dedup_hash,sort_key,created_at) VALUES('b','f','News','https://example.com/a','News body','b',2,1)");
 await processStage1ForArticles(['b']);
 expect(chat).toHaveBeenCalledTimes(1);
 expect(listArticles({classifications:['業界:IT・通信']}).articles.map(a=>a.id)).toEqual(['b']);
 expect(listArticles({classifications:['業界:食品・農業']}).articles.map(a=>a.id)).toEqual(['a']);
});
