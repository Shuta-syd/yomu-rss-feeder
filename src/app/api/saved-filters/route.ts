import {randomUUID} from 'node:crypto';
import {NextRequest,NextResponse} from 'next/server';
import {rawDb} from '@/lib/db';
import {withAuth,jsonError} from '@/lib/api-helpers';
import {savedFilterSchema} from '@/lib/saved-filters';
function list(){return (rawDb.prepare('SELECT id,name,conditions FROM saved_filters ORDER BY created_at,id').all() as {id:string;name:string;conditions:string}[]).map(r=>({...r,conditions:JSON.parse(r.conditions)}));}
export async function GET(){return withAuth(async()=>NextResponse.json(list()));}
export async function POST(req:NextRequest){return withAuth(async()=>{
 const parsed=savedFilterSchema.safeParse(await req.json().catch(()=>null));
 if(!parsed.success)return jsonError(400,'条件名と絞り込み条件を確認してください。');
 const result=rawDb.transaction(()=>{
  if(rawDb.prepare('SELECT 1 FROM saved_filters WHERE name=?').get(parsed.data.name))return 'duplicate';
  if((rawDb.prepare('SELECT COUNT(*) n FROM saved_filters').get() as {n:number}).n>=30)return 'limit';
  rawDb.prepare('INSERT INTO saved_filters(id,name,conditions,created_at) VALUES(?,?,?,?)').run(randomUUID(),parsed.data.name,JSON.stringify(parsed.data.conditions),Date.now());
  return 'ok';
 }).immediate();
 if(result!=='ok')return jsonError(409,result==='duplicate'?'同じ名前が登録済みです。別の名前で保存してください。':'保存できる条件は30件までです。');
 return NextResponse.json(list(),{status:201});
});}
export async function DELETE(req:NextRequest){return withAuth(async()=>{
 const id=req.nextUrl.searchParams.get('id');if(!id)return jsonError(400,'条件を指定してください。');
 const result=rawDb.prepare('DELETE FROM saved_filters WHERE id=?').run(id);
 if(!result.changes)return jsonError(404,'保存条件が見つかりません。');
 return NextResponse.json(list());
});}
