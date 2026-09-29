import {beforeAll,beforeEach,afterAll,describe,it,expect,vi} from 'vitest';
import {NextRequest} from 'next/server';
import {createTestDb} from '../helpers/test-db';
let testDb:ReturnType<typeof createTestDb>;
vi.mock('@/lib/db',()=>({get rawDb(){return testDb.raw},get db(){return testDb.db}}));
vi.mock('@/lib/api-helpers',()=>({withAuth:async(fn:()=>Promise<unknown>)=>fn(),jsonError:(status:number,error:string)=>Response.json({error},{status})}));
import {PATCH} from '@/app/api/articles/[id]/route';
import {listArticles} from '@/lib/articles-query';
import {buildArticlesParams} from '@/lib/articles-params';
import {buildFeedsUrl,parseFeedsUrl} from '@/lib/feeds-url-state';
beforeAll(()=>{testDb=createTestDb()});afterAll(()=>testDb.close());
beforeEach(()=>{testDb.raw.exec("DELETE FROM articles; DELETE FROM feeds; INSERT INTO feeds(id,title,url,created_at) VALUES('f','Feed','https://example.com/feed',1); INSERT INTO articles(id,feed_id,title,url,dedup_hash,sort_key,created_at) VALUES('a','f','A','https://example.com/a','a',2,1),('b','f','B','https://example.com/b','b',1,1);")});
const patch=(data:unknown)=>PATCH(new NextRequest('http://localhost/api/articles/a',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}),{params:Promise.resolve({id:'a'})});
describe('read later',()=>{
 it('persists independently from read state and favorites',async()=>{
  let a=await (await patch({isReadLater:true})).json();expect(a.isReadLater).toBe(true);expect(a.isRead).toBe(false);expect(a.isStarred).toBe(false);
  a=await (await patch({isRead:true,isStarred:true})).json();expect(a.isReadLater).toBe(true);
  a=await (await patch({isReadLater:false})).json();expect(a.isReadLater).toBe(false);expect(a.isRead).toBe(true);expect(a.isStarred).toBe(true);
 });
 it('rejects invalid flags without modifying saved state',async()=>{expect((await patch({isReadLater:'true'})).status).toBe(400);expect(listArticles({isReadLater:true}).total).toBe(0)});
 it('filters, counts, and paginates saved articles',async()=>{
  await patch({isReadLater:true});expect(listArticles({isReadLater:true}).articles.map(a=>a.id)).toEqual(['a']);
  testDb.raw.exec("UPDATE articles SET is_read_later=1 WHERE id='b'");
  const first=listArticles({isReadLater:true,limit:1});expect(first.total).toBe(2);expect(first.nextCursor).toBeTruthy();
  expect(listArticles({isReadLater:true,cursor:first.nextCursor!,limit:1}).articles.map(a=>a.id)).toEqual(['b']);
  await patch({isRead:true});expect(listArticles({isReadLater:true,isRead:false}).articles.map(a=>a.id)).toEqual(['b']);
 });
 it('restores saved view from URL and uses the dedicated API filter',()=>{
  const state=parseFeedsUrl('?view=later');expect(state.view).toBe('later');expect(buildFeedsUrl(state)).toBe('?view=later');
  const params=buildArticlesParams({view:'later',readFilter:'all'});expect(params.get('isReadLater')).toBe('true');expect(params.has('isRead')).toBe(false);expect(params.has('isStarred')).toBe(false);
 });
});
