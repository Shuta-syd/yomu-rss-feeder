import {beforeAll,beforeEach,describe,it,expect,vi} from 'vitest';
import {NextRequest} from 'next/server';
import {createTestDb} from '../helpers/test-db';
let testDb:ReturnType<typeof createTestDb>;
vi.mock('@/lib/db',()=>({get rawDb(){return testDb.raw}}));
vi.mock('@/lib/api-helpers',()=>({withAuth:async(fn:()=>Promise<unknown>)=>fn(),jsonError:(status:number,error:string)=>Response.json({error},{status})}));
import {GET,POST,DELETE} from '@/app/api/saved-filters/route';
import {filterConditionsSchema} from '@/lib/saved-filters';
beforeAll(()=>{testDb=createTestDb()});beforeEach(()=>testDb.raw.exec('DELETE FROM saved_filters'));
const post=(body:unknown)=>POST(new NextRequest('http://localhost/api/saved-filters',{method:'POST',body:JSON.stringify(body)}));
describe('saved filters',()=>{
 it('persists all reading conditions, rejects a duplicate name, and deletes only the selected preset',async()=>{
  const conditions={classifications:['業界:食品・農業','テーマ:AI'],search:'ロボット',readFilter:'unread',view:'feeds',feedId:null,category:'Business'};
  expect((await post({name:'農業AI',conditions})).status).toBe(201);
  const rows=await(await GET()).json();expect(rows[0].conditions).toEqual(conditions);
  expect((await post({name:'農業AI',conditions})).status).toBe(409);
  await post({name:'技術',conditions:{classifications:['ジャンル:テクノロジー']}});
  const result=await DELETE(new NextRequest('http://localhost/api/saved-filters?id='+rows[0].id,{method:'DELETE'}));
  expect((await result.json()).map((r:{name:string})=>r.name)).toEqual(['技術']);
 });
 it('does not store unknown tags or contradictory axes',async()=>{
  expect((await post({name:'bad',conditions:{classifications:['invented']}})).status).toBe(400);
  expect(filterConditionsSchema.safeParse({classifications:['テーマ:AI','テーマ:開発・学び']}).success).toBe(false);
  expect(filterConditionsSchema.safeParse({feedId:'f',category:'c'}).success).toBe(false);
  expect(await(await GET()).json()).toEqual([]);
 });
});
