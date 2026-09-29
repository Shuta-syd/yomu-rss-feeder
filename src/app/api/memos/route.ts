import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {withAuth,jsonError} from '@/lib/api-helpers';
import {publicMemosConfig,saveMemosConfig,disconnectMemos} from '@/lib/memos/settings';
import {MemosError} from '@/lib/memos/client';
export async function GET(){return withAuth(async()=>NextResponse.json(publicMemosConfig()));}
export async function POST(req:NextRequest){return withAuth(async()=>{
 const parsed=z.object({origin:z.string().max(2048),token:z.string().max(8192).optional()}).safeParse(await req.json().catch(()=>null));
 if(!parsed.success)return jsonError(400,'接続先とトークンを確認してください。');
 try{return NextResponse.json(await saveMemosConfig(parsed.data.origin,parsed.data.token));}catch(e){return jsonError(e instanceof MemosError?e.status:500,e instanceof MemosError?e.message:'接続設定を保存できませんでした。');}
});}
export async function DELETE(){return withAuth(async()=>{disconnectMemos();return NextResponse.json(publicMemosConfig());});}
