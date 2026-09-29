import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {withAuth,jsonError} from '@/lib/api-helpers';
import {getLoginSettings,saveLoginSettings,clearLoginCredentials} from '@/lib/browser/login-settings';
import {submitNikkeiOtp} from '@/lib/browser/otp';
import {BrowserImportError} from '@/lib/browser/article-import';
import {checkRateLimit} from '@/lib/auth';
import {ensureNikkeiLogin} from '@/lib/browser/login';
const schema=z.object({enabled:z.boolean(),email:z.string().trim().email().max(320).optional(),password:z.string().min(1).max(1024).optional()});
function sameOrigin(req:NextRequest){try{const u=new URL(req.headers.get('origin')??'');return u.host===req.headers.get('host')&&u.protocol===req.nextUrl.protocol;}catch{return false;}}
export async function GET(){return withAuth(async()=>NextResponse.json(getLoginSettings()));}
export async function PUT(req:NextRequest){return withAuth(async()=>{
 if(!sameOrigin(req))return jsonError(403,'Yomuの設定画面から操作してください。');
 const input=schema.safeParse(await req.json().catch(()=>null));
 if(!input.success)return jsonError(400,'メールアドレスとパスワードを確認してください。');
 try{return NextResponse.json(saveLoginSettings(input.data));}catch{return jsonError(409,'保存できませんでした。ログイン処理中でないことと、メールアドレス・パスワードを両方入力したことを確認してください。');}
});}
export async function POST(req:NextRequest){return withAuth(async()=>{
 if(!sameOrigin(req))return jsonError(403,'Yomuの設定画面から操作してください。');
 const text=await req.text();
 if(text) {
  const input=z.object({code:z.string().regex(/^\d{6}$/)}).strict().safeParse(await Promise.resolve().then(()=>JSON.parse(text)).catch(()=>null));
  if(!input.success)return jsonError(400,'確認コードを6桁の数字で入力してください。');
  try {
   checkRateLimit('nikkei-otp',5);
   return NextResponse.json(await submitNikkeiOtp(input.data.code));
  } catch(e) {
   if(e instanceof Response)return jsonError(e.status,'しばらく待ってから確認コードを再送信してください。');
   if(e instanceof BrowserImportError)return jsonError(409,e.message);
   return jsonError(500,'確認コードの送信に失敗しました。接続状態を確認してください。');
  }
 }
 return NextResponse.json(await ensureNikkeiLogin({force:true}));
});}
export async function DELETE(req:NextRequest){return withAuth(async()=>{
 if(!sameOrigin(req))return jsonError(403,'Yomuの設定画面から操作してください。');
 try{clearLoginCredentials();return NextResponse.json(getLoginSettings());}catch{return jsonError(409,'ログイン処理が終わってから削除してください。');}
});}
