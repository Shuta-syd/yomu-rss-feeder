import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createTestDb } from '../../helpers/test-db';
let testDb: ReturnType<typeof createTestDb>;
vi.mock('@/lib/db',()=>({get rawDb(){return testDb.raw;}}));
import { reuseArticleResult } from '@/lib/llm/article-cache';
const request={url:'https://example.com/story?utm_source=rss',provider:'gemini',model:'lite',params:{systemPrompt:'Return JSON',userPrompt:'An article',maxOutputTokens:200}};
const validate=(s:string)=>{JSON.parse(s);};
beforeEach(()=>{testDb=createTestDb();});
afterEach(()=>{testDb.close();});
it('counts reuse without invoking the generation callback again',async()=>{
 let calls=0;const generate=async()=>{calls++;return '{"summary":"ok"}';};
 await reuseArticleResult(request,generate,validate);
 const hit=await reuseArticleResult({...request,url:'https://example.com/story?utm_source=other#top'},generate,validate);
 expect(hit).toEqual({content:'{"summary":"ok"}',reused:true});expect(calls).toBe(1);
 expect(testDb.raw.prepare('SELECT reuse_count n FROM ai_result_cache').get()).toEqual({n:1});
});
it.each(['model','systemPrompt','userPrompt'])('invalidates on %s changes',async field=>{
 await reuseArticleResult(request,async()=>'"old"',validate);
 const changed=field==='model'?{...request,model:'new'}:{...request,params:{...request.params,[field]:'changed'}};
 expect(await reuseArticleResult(changed,async()=>'"new"',validate)).toEqual({content:'"new"',reused:false});
});
it('recovers an abandoned lease and replaces corrupted cache data',async()=>{
 await reuseArticleResult(request,async()=>'"ok"',validate);
 testDb.raw.exec("UPDATE ai_result_cache SET content=NULL,owner='crashed',expires_at=0");
 expect((await reuseArticleResult(request,async()=>'"recovered"',validate)).reused).toBe(false);
 testDb.raw.exec("UPDATE ai_result_cache SET content='not json'");
 expect((await reuseArticleResult(request,async()=>'"valid"',validate)).content).toBe('"valid"');
});
it('releases failed generation so a later attempt can succeed',async()=>{
 await expect(reuseArticleResult(request,async()=>{throw new Error('upstream');},validate)).rejects.toThrow('upstream');
 expect(testDb.raw.prepare('SELECT count(*) n FROM ai_result_cache').get()).toEqual({n:0});
 expect((await reuseArticleResult(request,async()=>'"recovered"',validate)).content).toBe('"recovered"');
});
it('refreshes explicitly and makes the new validated result reusable',async()=>{
 await reuseArticleResult(request,async()=>'"old"',validate);
 await reuseArticleResult({...request,fresh:true},async()=>'"new"',validate);
 expect((await reuseArticleResult(request,async()=>'"unexpected"',validate)).content).toBe('"new"');
});
it('does not reuse for unidentifiable URLs',async()=>{
 const invalid={...request,url:'not a URL'};
 await reuseArticleResult(invalid,async()=>'"first"',validate);
 expect((await reuseArticleResult(invalid,async()=>'"second"',validate)).content).toBe('"second"');
 expect(testDb.raw.prepare('SELECT count(*) n FROM ai_result_cache').get()).toEqual({n:0});
});
it('reuses a schema-less cache entry from before structured-output support',async()=>{
 const {createHash}=await import('node:crypto');
 // Legacy persisted key shape, intentionally independent of the new cache-key implementation.
 const oldKey=createHash('sha256').update(JSON.stringify(['article-result-v1','https://example.com/story','gemini','lite','Return JSON','An article',null,0.3,200])).digest('hex');
 testDb.raw.prepare('INSERT INTO ai_result_cache(cache_key,content,owner,expires_at) VALUES(?,?,NULL,?)').run(oldKey,'"previously paid"',Date.now()+60_000);
 const result=await reuseArticleResult(request,async()=>{throw new Error('must not charge again');},validate);
 expect(result).toEqual({content:'"previously paid"',reused:true});
});
