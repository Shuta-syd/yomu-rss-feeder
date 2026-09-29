"use client";
import {useEffect,useState} from 'react';
import {pendingBrowserImport,takeBrowserImport} from '@/lib/browser-import-resume';
type Login={enabled:boolean;hasCredentials:boolean;state:string;checkedAt:number|null};
const stateLabels:Record<string,string>={idle:'未確認',running:'ログインを確認中…',logged_in:'ログイン済み',otp_required:'メールに届いた確認コードを入力してください。',otp_invalid:'確認コードが正しくありません。メールのコードを確認してください。',otp_expired:'確認コードの有効期限が切れました。ログインをやり直してください。',manual_required:'確認コード以外の手動操作が必要です。連携用Chromeを確認してください。',failed:'ログインに失敗しました。登録情報を確認してから再試行してください。',disconnected:'Chromeへの接続を確認してください。'};
export function BrowserIntegrationPanel(){
 const [status,setStatus]=useState<{configured:boolean;connected:boolean}|null>(null);
 const [login,setLogin]=useState<Login|null>(null),[email,setEmail]=useState(''),[password,setPassword]=useState('');
 const [error,setError]=useState(''),[busy,setBusy]=useState(false);
 const [code,setCode]=useState('');
 const [pendingId,setPendingId]=useState<string|null>(null);
 const [resume,setResume]=useState<{id:string;state:'running'|'done'|'failed';message:string}|null>(null);
 useEffect(()=>{try{setPendingId(pendingBrowserImport(sessionStorage));}catch{/* Storage is optional. */}},[]);
 useEffect(()=>{
  if(login?.state!=='logged_in')return;
  let id:string|null=null;try{id=takeBrowserImport(sessionStorage);}catch{return;}
  if(!id)return;
  const articleId=id;
  setPendingId(null);setResume({id:articleId,state:'running',message:'認証が完了しました。記事の本文を取り込んでいます…'});
  void (async()=>{
   try {
    const response=await fetch(`/api/articles/${encodeURIComponent(articleId)}/browser-import`,{method:'POST'});
    const result=await response.json();if(!response.ok)throw new Error(result.error??'取り込みに失敗しました。');
    setResume({id:articleId,state:'done',message:`${Number(result.characters).toLocaleString()}文字の本文を取り込みました。`});
   } catch(e){setResume({id:articleId,state:'failed',message:e instanceof Error?e.message:'本文を取り込めませんでした。記事画面から再試行してください。'});}
  })();
 },[login?.state]);
 useEffect(()=>{
  let active=true;
  const load=async()=>{try{
   const [b,l]=await Promise.all([fetch('/api/browser'),fetch('/api/browser/login')]);
   if(!b.ok||!l.ok)throw new Error();const [browser,next]=await Promise.all([b.json(),l.json()]);
   if(active){setStatus(browser);setLogin(next);}
  }catch{if(active)setError('接続状態を確認できませんでした');}};
  void load();const timer=setInterval(load,10000);return()=>{active=false;clearInterval(timer);};
 },[]);
 const action=async(method:'PUT'|'POST'|'DELETE',body?:unknown)=>{
  setBusy(true);setError('');
  try{
   const r=await fetch('/api/browser/login',{method,headers:{'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
   const next=await r.json();if(!r.ok)throw new Error(next.error??'操作に失敗しました');setLogin(next);
   if(method==='PUT'){setEmail('');setPassword('');setError('保存しました。自動確認時と本文取り込み時にログイン状態を確認します。');}
   if(method==='DELETE'){setEmail('');setPassword('');setError('保存したログイン情報を削除し、自動ログインを停止しました。Chromeのログイン状態は維持されます。');}
  }catch(e){setError(e instanceof Error?e.message:'操作に失敗しました');}finally{setBusy(false);}
 };
 const inputStyle={background:'var(--bg)',color:'var(--fg)',border:'1px solid var(--card-border)'};
 const disabled=busy||login?.state==='running';
 const otpVisible=!!login&&['otp_required','otp_invalid','otp_expired'].includes(login.state);
 return <section className="space-y-3 rounded-lg border p-4" style={{borderColor:'var(--card-border)',background:'var(--card)'}}>
  <h2 className="text-sm font-semibold">日経の自動ログイン・本文取り込み</h2>
  <p className="text-sm">{!status?'確認中…':status.connected?'連携用Chromeに接続しています':status.configured?'連携用Chromeが起動していません':'この環境ではブラウザー連携が未設定です'}</p>
  {login&&<p className="text-sm" role="status">自動ログイン：{login.enabled?'オン':'オフ'} ／ {stateLabels[login.state]??'未確認'}{login.checkedAt&&<span className="block text-xs" style={{color:'var(--muted)'}}>最終確認：{new Date(login.checkedAt).toLocaleString('ja-JP')}</span>}</p>}
  {pendingId&&<p className="rounded-lg p-3 text-sm" style={{background:'var(--accent-subtle)',color:'var(--accent)'}}>認証後、先ほどの記事の本文取り込みを一度だけ再開します。</p>}
  {resume&&<div className="rounded-lg border p-3 text-sm" style={{borderColor:'var(--card-border)'}} role="status">
   <p>{resume.message}</p>
   {resume.state!=='running'&&<a className="mt-2 inline-flex min-h-11 items-center underline" href={`/feeds?article=${encodeURIComponent(resume.id)}`}>{resume.state==='done'?'取り込んだ記事を読む →':'記事を開いて再試行 →'}</a>}
  </div>}
  {otpVisible&&<form className="space-y-3 rounded-xl border p-4" style={{background:'var(--accent-subtle)',borderColor:'var(--accent)'}} onSubmit={e=>{e.preventDefault();if(disabled||code.length!==6||login?.state==='otp_expired')return;const submitted=code;setCode('');void action('POST',{code:submitted});}}>
   <h3 className="font-semibold">メールの確認コード</h3>
   <p className="text-sm leading-relaxed">日経の登録メールアドレスに届いた6桁の数字を入力してください。コードは保存されません。</p>
   <label className="block text-sm" htmlFor="nikkei-otp">確認コード</label>
   <input id="nikkei-otp" name="nikkei-otp" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={e=>setCode(e.target.value.normalize('NFKC').replace(/[^0-9]/g,'').slice(0,6))} disabled={disabled||login?.state==='otp_expired'} aria-describedby="nikkei-otp-status" className="min-h-12 w-full rounded-lg border px-4 py-3 text-center text-2xl tracking-[0.35em] disabled:opacity-50" style={inputStyle} placeholder="000000"/>
   <p id="nikkei-otp-status" className="text-sm" role="status">{stateLabels[login?.state??'']}</p>
   <div className="flex flex-col gap-2 sm:flex-row">
    <button disabled={disabled||code.length!==6||login?.state==='otp_expired'} className="min-h-11 flex-1 rounded-lg px-4 py-3 text-sm font-medium disabled:opacity-50" style={{background:'var(--accent)',color:'var(--accent-fg)'}}>{busy?'確認中…':'確認コードを送信'}</button>
    <button type="button" disabled={disabled} onClick={()=>{setCode('');void action('POST');}} className="min-h-11 rounded-lg border px-4 py-3 text-sm disabled:opacity-50" style={{borderColor:'var(--card-border)'}}>ログインをやり直す</button>
   </div>
  </form>}
  <form className="space-y-3" onSubmit={e=>{e.preventDefault();void action('PUT',{enabled:true,...(email||password?{email,password}:{})});}}>
   <p className="text-xs leading-relaxed" style={{color:'var(--muted)'}}>日経のメールアドレスとパスワードを暗号化して保存します。ログインが切れた場合は自動で再ログインします。追加認証が必要な場合は処理を止め、この画面に表示します。</p>
   <label className="block text-xs">日経ID（メールアドレス）<input name="nikkei-email" type="email" autoComplete="off" value={email} onChange={e=>setEmail(e.target.value)} placeholder={login?.hasCredentials?'登録済み・変更する場合のみ入力':'メールアドレス'} className="mt-1 w-full rounded p-2" style={inputStyle}/></label>
   <label className="block text-xs">日経のパスワード<input name="nikkei-password" type="password" autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)} placeholder={login?.hasCredentials?'登録済み・変更する場合のみ入力':'パスワード'} className="mt-1 w-full rounded p-2" style={inputStyle}/></label>
   <div className="flex flex-wrap gap-2">
    <button disabled={disabled} className="rounded px-3 py-2 text-xs disabled:opacity-50" style={{background:'var(--accent)',color:'var(--accent-fg)'}}>保存して自動ログインを有効にする</button>
    {login?.enabled&&<button type="button" disabled={disabled} onClick={()=>action('PUT',{enabled:false})} className="rounded border px-3 py-2 text-xs" style={{borderColor:'var(--card-border)'}}>自動ログインを停止</button>}
   </div>
  </form>
  <div className="flex flex-wrap gap-3">
   <button disabled={disabled||!login?.enabled} onClick={()=>action('POST')} className="rounded px-3 py-2 text-xs disabled:opacity-50" style={{background:'var(--accent-subtle)',color:'var(--accent)'}}>今すぐ接続確認・再ログイン</button>
   {login?.hasCredentials&&<button disabled={disabled} onClick={()=>action('DELETE')} className="text-xs underline">登録情報を削除</button>}
  </div>
  {error&&<p className="text-xs" role="status">{error}</p>}
  <p className="text-xs leading-relaxed" style={{color:'var(--muted)'}}>Yomuの記事画面で「ブラウザーの本文を取り込む」を押すと、連携用Chromeが記事を開いて本文を保存します。手元のブラウザーで記事を開いておく必要はありません。</p>
 </section>;
}
