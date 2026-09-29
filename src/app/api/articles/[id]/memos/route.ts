import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {withAuth,jsonError} from '@/lib/api-helpers';
import {rawDb} from '@/lib/db';
import {memosConnection} from '@/lib/memos/settings';
import {MemosError,type Memo} from '@/lib/memos/client';
import {memoId,contentVersion} from '@/lib/memos/content';
type Context={params:Promise<{id:string}>};
const busy=new Set<string>();
function connection(id:string){if(!rawDb.prepare('SELECT 1 FROM articles WHERE id=?').get(id))throw new MemosError(404,'記事が見つかりません。');const c=memosConnection();return {...c,id:memoId(id,c.origin,c.user)};}
function result(c:ReturnType<typeof connection>,memo:Memo|null){if(memo&&memo.creator!==c.user)throw new MemosError(403,'別のアカウントのメモは編集できません。');return {saved:!!memo,content:memo?.content??'',version:memo?contentVersion(memo.content):null,connectionId:c.connectionId,url:memo?`${c.origin}/${memo.name}`:null};}
function failure(e:unknown){return jsonError(e instanceof MemosError?e.status:500,e instanceof MemosError?e.message:'Memosとの連携に失敗しました。');}
export async function GET(_req:NextRequest,ctx:Context){return withAuth(async()=>{try{const c=connection((await ctx.params).id);let memo:Memo|null=null;try{memo=await c.client.memo(c.id);}catch(e){if(!(e instanceof MemosError&&e.status===404))throw e;}return NextResponse.json(result(c,memo));}catch(e){return failure(e);}});}
export async function POST(req:NextRequest,ctx:Context){return withAuth(async()=>{
 const input=z.object({content:z.string().trim().min(1).max(50000),version:z.string().length(64).nullable(),connectionId:z.string().length(64)}).safeParse(await req.json().catch(()=>null));
 if(!input.success)return jsonError(400,'メモの内容を確認してください（最大50,000文字）。');
 let lock:string|undefined;
 try{
  const c=connection((await ctx.params).id);
  if(input.data.connectionId!==c.connectionId)throw new MemosError(409,'接続先が変更されています。最新の内容を読み込んでください。');
  if(busy.has(c.id))throw new MemosError(409,'保存中です。少し待って最新の内容を読み込んでください。');
  lock=c.id;busy.add(lock);
  let current:Memo|null=null;try{current=await c.client.memo(c.id);}catch(e){if(!(e instanceof MemosError&&e.status===404))throw e;}
  result(c,current);
  if(current?contentVersion(current.content)!==input.data.version:input.data.version!==null)throw new MemosError(409,'Memos側の内容が変更または削除されています。入力をコピーしてから最新の内容を読み込んでください。');
  const saved=current?await c.client.update(c.id,input.data.content):await c.client.create(c.id,input.data.content);
  return NextResponse.json(result(c,saved),{status:current?200:201});
 }catch(e){return failure(e);}finally{if(lock)busy.delete(lock);}
});}
