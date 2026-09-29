import { beforeAll,beforeEach,afterAll,expect,it,vi } from 'vitest';
import {createTestDb} from '../helpers/test-db';
let database:ReturnType<typeof createTestDb>;
vi.mock('@/lib/db',()=>({get rawDb(){return database.raw},get db(){return database.db}}));
import {updateSettings} from '@/lib/settings';
let searchWithJev:typeof import('@/lib/jev-search').searchWithJev;
beforeAll(()=>{database=createTestDb();vi.stubEnv('ENCRYPTION_KEY','ab'.repeat(32));});
beforeEach(async()=>{
 vi.resetModules();({searchWithJev}=await import('@/lib/jev-search'));
 database.raw.exec('DELETE FROM articles; DELETE FROM feeds; DELETE FROM app_config; DELETE FROM ai_usage;');
 updateSettings({jevApiKey:crypto.randomUUID(),jevSearchEnabled:true,geminiApiKey:'fake-key'});
 database.raw.exec("INSERT INTO feeds(id,title,url,created_at) VALUES('f','Feed','https://example.com/feed',1)");
 for(const [id,title,time] of [['old','候補者の見極め方',1],['new','採用面談で聞く質問',10],['noise','採用市場のニュース',100]] as const){
 database.raw.prepare('INSERT INTO articles(id,feed_id,title,url,dedup_hash,sort_key,created_at) VALUES(?,?,?,?,?,?,1)').run(id,'f',title,'https://example.com/'+id,id,time);
 }
});
afterAll(()=>{database.close();vi.unstubAllEnvs();vi.unstubAllGlobals();});
function remote(mode='ok'){
 let calls=0;
 vi.stubGlobal('fetch',vi.fn(async(url:string,init:RequestInit)=>{
  calls++;
  if(url.startsWith('https://generativelanguage.googleapis.com/'))return Response.json({candidates:[{content:{parts:[{text:JSON.stringify({terms:['採用面談','候補者','採用']})}]}}],usageMetadata:{promptTokenCount:100,candidatesTokenCount:25}});
  expect(url).toBe('https://api.typesafe.ai/v1/systemone');
  if(mode==='offline')return Response.json({error:'private upstream detail'},{status:429});
  const body=JSON.parse(String(init.body));
  const answers=Object.fromEntries(Object.keys(body.questions).map(key=>{
   const doc=body.state.articles[Number(key.split('_')[1])];
   return [key,{type:'score',score:doc?.title==='候補者の見極め方'?2.9:doc?.title==='採用面談で聞く質問'?2.5:0.2,legend:{'0':'unrelated','1':'tangential','2':'relevant','3':'direct'},probabilities:{'0':0,'1':0,'2':0,'3':1},confidence:1}];
  }));
  if(mode==='invalid')delete answers[Object.keys(answers)[0]!];
  return Response.json({model:'jev-1.13.0',answers,usage:{input_tokens:200,output_tokens:20}});
 }));
 return ()=>calls;
}
it('excludes noise, preserves relevance order across pages and does not charge again for pagination',async()=>{
 const calls=remote();const first=await searchWithJev({search:'面接について',limit:1});
 expect(first.articles.map(a=>a.id)).toEqual(['old']);expect(first.total).toBe(2);expect(first.nextCursor).toBeTruthy();
 const before=calls();const next=await searchWithJev({search:'面接について',limit:1,cursor:first.nextCursor!});
 expect(next.articles.map(a=>a.id)).toEqual(['new']);expect(next.nextCursor).toBeNull();expect(calls()).toBe(before);
 expect(database.raw.prepare("SELECT count(*) n FROM ai_usage WHERE status='success'").get()).toEqual({n:2});
 const again=await searchWithJev({search:'面接について'});expect(again.total).toBe(2);expect(calls()).toBe(before);
});
it('does not accept a cursor from another query',async()=>{
 remote();const first=await searchWithJev({search:'面接について',limit:1});
 await expect(searchWithJev({search:'旅行',cursor:first.nextCursor!})).rejects.toThrow();
});
it('rechecks read filters when serving cached rankings',async()=>{
 remote();await searchWithJev({search:'面接について',isRead:false});
 database.raw.prepare("UPDATE articles SET is_read=1 WHERE id='old'").run();
 expect((await searchWithJev({search:'面接について',isRead:false})).articles.map(a=>a.id)).toEqual(['new']);
});
it('fails explicitly on provider failure, never silently returns unfiltered candidates',async()=>{
 remote('offline');await expect(searchWithJev({search:'面接について'})).rejects.toThrow('Jev');
});
it('rejects partial responses instead of treating missing judgments as unrelated',async()=>{
 remote('invalid');await expect(searchWithJev({search:'面接について'})).rejects.toThrow('Jev');
});
it('returns zero results without Jev calls when no candidates exist',async()=>{
 database.raw.exec('DELETE FROM articles');const calls=remote();
 expect((await searchWithJev({search:'面接について'})).articles).toEqual([]);expect(calls()).toBe(0);
});
it('requires a key before spending on title judgments',async()=>{
 updateSettings({jevApiKey:null});const calls=remote();await expect(searchWithJev({search:'面接について'})).rejects.toThrow();expect(calls()).toBe(0);
});
it('does not skip the next result if the previous page becomes read',async()=>{
 remote();const first=await searchWithJev({search:'面接について',isRead:false,limit:1});
 database.raw.prepare("UPDATE articles SET is_read=1 WHERE id='old'").run();
 const next=await searchWithJev({search:'面接について',isRead:false,limit:1,cursor:first.nextCursor!});
 expect(next.articles.map(a=>a.id)).toEqual(['new']);
});
it('rejects over-budget searches before any remote call',async()=>{
 database.raw.prepare("INSERT INTO app_config(key,value) VALUES('ai_budget',?)").run(JSON.stringify({dailyYen:0,monthlyYen:0}));
 const calls=remote();await expect(searchWithJev({search:'面接について'})).rejects.toThrow('予算');expect(calls()).toBe(0);
});
it('coalesces simultaneous identical searches',async()=>{
 const calls=remote();const results=await Promise.all([searchWithJev({search:'面接について'}),searchWithJev({search:'面接について'})]);
 expect(results.map(r=>r.total)).toEqual([2,2]);expect(calls()).toBe(2);
});
it('expires a cursor instead of repeating paid work for a stale page',async()=>{
 const calls=remote();const first=await searchWithJev({search:'面接について',limit:1});const before=calls();
 const now=Date.now();const clock=vi.spyOn(Date,'now').mockReturnValue(now+31*60_000);
 try { await expect(searchWithJev({search:'面接について',cursor:first.nextCursor!})).rejects.toThrow('有効期限');expect(calls()).toBe(before); }
 finally {clock.mockRestore();}
});
it('releases the pending search slot and usage reservation after request cancellation',async()=>{
 const timeout=vi.spyOn(AbortSignal,'timeout').mockImplementation(()=>AbortSignal.abort(new Error('deadline fixture')));
 vi.stubGlobal('fetch',async(_url:string,init:RequestInit)=>{init.signal?.throwIfAborted();throw new Error('should abort');});
 try {await expect(searchWithJev({search:'面接について'})).rejects.toThrow();}
 finally{timeout.mockRestore();}
 expect(database.raw.prepare("SELECT count(*) n FROM ai_usage WHERE status='reserved'").get()).toEqual({n:0});
 remote();expect((await searchWithJev({search:'面接について'})).total).toBe(2);
});
