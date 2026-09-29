import { beforeAll, beforeEach, afterAll, expect, it, vi } from 'vitest';
import { createTestDb } from '../helpers/test-db';
let database: ReturnType<typeof createTestDb>;
vi.mock('@/lib/db', () => ({ get rawDb() { return database.raw; }, get db() { return database.db; } }));
import { updateSettings } from '@/lib/settings';
let searchWithJev: typeof import('@/lib/jev-search').searchWithJev;
beforeAll(() => { database = createTestDb(); vi.stubEnv('ENCRYPTION_KEY', 'ab'.repeat(32)); });
beforeEach(async () => {
  vi.resetModules(); ({searchWithJev}=await import('@/lib/jev-search'));
  database.raw.exec('DELETE FROM articles; DELETE FROM feeds; DELETE FROM app_config; DELETE FROM ai_usage;');
  updateSettings({ jevApiKey: crypto.randomUUID(), jevSearchEnabled: true });
  database.raw.exec("INSERT INTO feeds(id,title,url,category,created_at) VALUES('f','Feed','https://example.com/f','Business',1),('other','Other','https://example.com/o','Tech',1)");
});
afterAll(() => { database.close(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
function add(id: string, title: string, feed='f') {
  database.raw.prepare('INSERT INTO articles(id,feed_id,title,url,dedup_hash,sort_key,created_at,content_plain) VALUES(?,?,?,?,?,1,1,?)').run(id,feed,title,'https://example.com/'+id,id,'本文のみの秘密文字列：応募者との対話について説明');
}
function remote(failAt=0) {
  const titles: string[] = [], bodies: string[] = [];
  let count=0;
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    expect(url).toBe('https://api.typesafe.ai/v1/systemone');
    const body=JSON.parse(String(init.body));
    count++;
    if(count===failAt) return Response.json({}, {status:503});
    const docs=body.state.articles as {title:string;excerpt?:string}[];
    for(const a of docs) {
      (body.state.stage==='titles'?titles:bodies).push(a.title);
      if(body.state.stage==='titles') expect(a).not.toHaveProperty('excerpt');
    }
    return Response.json({answers:Object.fromEntries(docs.map((a,i)=>['article_'+i,{type:'score',score:a.title.includes('応募者')?3:0}])),usage:{input_tokens:200,output_tokens:20}});
  }));
  return {titles,bodies,count:()=>count};
}
it('judges every scoped title without keyword prefilter or Stage1 key; only matches get body checks', async () => {
  for(let i=0;i<130;i++)add('a'+i,'無関係なニュース'+i);
  add('relevant','応募者の本音を引き出す質問');
  const r=remote();
  const result=await searchWithJev({search:'面接について'});
  expect(result.articles.map(a=>a.id)).toEqual(['relevant']);
  expect(r.titles).toHaveLength(131);
  expect(r.bodies).toEqual(['応募者の本音を引き出す質問']);
  expect(result.search).toMatchObject({titleTotal:131,titleChecked:131,bodyTotal:1,bodyChecked:1});
});
it.each([{feedId:'f'},{category:'Business'}])('applies scope before sending titles: %j',async scope=>{
 add('a','応募者の質問');add('b','応募者の面談','other');
 const r=remote();const result=await searchWithJev({search:'面接',...scope});
 expect(result.articles.map(a=>a.id)).toEqual(['a']);expect(r.titles).toEqual(['応募者の質問']);
});
it('supports results beyond 100 with stable pagination and no repeated paid checks',async()=>{
 for(let i=0;i<135;i++)add('a'+String(i).padStart(3,'0'),'応募者への質問'+i);
 const r=remote();const first=await searchWithJev({search:'面接',limit:100});const costCalls=r.count();
 expect(first.total).toBe(135);expect(first.articles).toHaveLength(100);
 const next=await searchWithJev({search:'面接',limit:100,cursor:first.nextCursor!});
 expect(next.articles).toHaveLength(35);expect(next.nextCursor).toBeNull();expect(r.count()).toBe(costCalls);
});
it('returns bounded progress, resumes a job, and rejects job tokens from another scope',async()=>{
 for(let i=0;i<2200;i++)add('a'+i,'無関係'+i);
 const r=remote();const first=await searchWithJev({search:'面接'},{incremental:true});
 expect(first.pending).toBe(true);expect(first.search.titleChecked).toBeLessThan(2200);expect(first.search.titleChecked).toBeGreaterThan(0);
 await expect(searchWithJev({search:'面接',feedId:'other'},{incremental:true,jobId:first.search.jobId})).rejects.toThrow('有効期限');
 let page=first;
 while(page.pending)page=await searchWithJev({search:'面接'},{incremental:true,jobId:first.search.jobId});
 expect(page.search.titleChecked).toBe(2200);expect(r.titles).toHaveLength(2200);
});
it('retains completed title batches on failure so retry does not pay for them again',async()=>{
 for(let i=0;i<130;i++)add('a'+i,'無関係'+i);
 const r=remote(2);
 await expect(searchWithJev({search:'面接'})).rejects.toThrow('Jev');
 const before=[...r.titles];expect(before.length).toBeGreaterThan(0);
 const result=await searchWithJev({search:'面接'});
 expect(result.total).toBe(0);expect(r.titles).toHaveLength(130);expect(new Set(r.titles).size).toBe(130);
});
it('does not evict paid partial work when the cache fills',async()=>{
 for(let i=0;i<65;i++)add('a'+i,'無関係'+i);
 let first:ReturnType<typeof remote>|undefined;
 for(let i=0;i<10;i++) {
   const r=remote(2);if(i===0)first=r;
   await expect(searchWithJev({search:'query'+i})).rejects.toThrow('Jev');
 }
 const r=remote();
 await expect(searchWithJev({search:'overflow'})).rejects.toThrow('検索');expect(r.count()).toBe(0);
 await searchWithJev({search:'query0'});
 expect(first!.titles.length+r.titles.length).toBe(65);
});
