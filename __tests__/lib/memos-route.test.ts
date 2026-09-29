import {beforeEach,expect,it,vi} from 'vitest';
import {NextRequest} from 'next/server';
import {memoId,contentVersion,connectionId} from '../../src/lib/memos/content';
import {MemosError} from '../../src/lib/memos/client';
const mocked=vi.hoisted(()=>({memo:vi.fn(),create:vi.fn(),update:vi.fn(),auth:true,exists:true}));
vi.mock('@/lib/api-helpers',()=>({withAuth:async(fn:()=>unknown)=>mocked.auth?fn():Response.json({}, {status:401}),jsonError:(status:number,error:string)=>Response.json({error},{status})}));
vi.mock('@/lib/db',()=>({rawDb:{prepare:()=>({get:()=>mocked.exists?{}:undefined})}}));
vi.mock('@/lib/memos/settings',()=>({memosConnection:()=>({origin:'https://memos.example',user:'users/a',connectionId:connectionId('https://memos.example','users/a'),client:mocked})}));
import {GET,POST} from '@/app/api/articles/[id]/memos/route';
const ctx={params:Promise.resolve({id:'article'})};
const memo={name:'memos/'+memoId('article','https://memos.example','users/a'),content:'original',creator:'users/a',visibility:'PRIVATE'};
const post=(body={content:'edited',version:null as string|null,connectionId:connectionId('https://memos.example','users/a')})=>POST(new NextRequest('http://localhost/api/articles/article/memos',{method:'POST',body:JSON.stringify(body)}),ctx);
beforeEach(()=>{vi.clearAllMocks();mocked.auth=true;mocked.exists=true;mocked.memo.mockRejectedValue(new MemosError(404,'missing'));mocked.create.mockResolvedValue(memo);mocked.update.mockResolvedValue({...memo,content:'edited'});});
it('creates once and detects an existing memo on retry',async()=>{
 expect((await post()).status).toBe(201);expect(mocked.create).toHaveBeenCalledTimes(1);
 mocked.memo.mockResolvedValue(memo);
 expect((await post()).status).toBe(409);expect(mocked.create).toHaveBeenCalledTimes(1);
 const state=await(await GET(new NextRequest('http://localhost'),ctx)).json();expect(state.saved).toBe(true);expect(state.version).toBe(contentVersion('original'));
});
it('updates only the content that was actually loaded and blocks remote changes/deletion',async()=>{
 mocked.memo.mockResolvedValue(memo);
 expect((await post({content:'edited',version:contentVersion('original'),connectionId:connectionId('https://memos.example','users/a')})).status).toBe(200);
 mocked.memo.mockResolvedValue({...memo,content:'edited elsewhere'});
 expect((await post({content:'edited',version:contentVersion('original'),connectionId:connectionId('https://memos.example','users/a')})).status).toBe(409);
 mocked.memo.mockRejectedValue(new MemosError(404,'missing'));
 expect((await post({content:'edited',version:contentVersion('original'),connectionId:connectionId('https://memos.example','users/a')})).status).toBe(409);
 expect(mocked.update).toHaveBeenCalledTimes(1);
});
it('rejects a changed destination, other owner and nonexistent article',async()=>{
 expect((await post({content:'edited',version:null,connectionId:'f'.repeat(64)})).status).toBe(409);expect(mocked.memo).not.toHaveBeenCalled();
 mocked.memo.mockResolvedValue({...memo,creator:'users/b'});expect((await post()).status).toBe(403);
 mocked.exists=false;expect((await post()).status).toBe(404);
});
it('propagates authentication problems without treating them as a missing memo',async()=>{
 mocked.memo.mockRejectedValue(new MemosError(401,'token expired'));expect((await post()).status).toBe(401);expect(mocked.create).not.toHaveBeenCalled();
 mocked.auth=false;expect((await GET(new NextRequest('http://localhost'),ctx)).status).toBe(401);
});
it('blocks simultaneous saves and releases the lock after failure',async()=>{
 let resolve!:(m:typeof memo)=>void;mocked.create.mockImplementationOnce(()=>new Promise(r=>{resolve=r}));
 const first=post();await vi.waitFor(()=>expect(mocked.create).toHaveBeenCalled());
 expect((await post()).status).toBe(409);resolve(memo);expect((await first).status).toBe(201);
 expect((await post()).status).toBe(201);
});
