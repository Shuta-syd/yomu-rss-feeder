"use client";
import "../memos.css";
import {useEffect,useState} from 'react';
export function MemosIntegrationPanel(){
 const [origin,setOrigin]=useState('https://memos.my-house.tokyo'),[token,setToken]=useState('');
 const [status,setStatus]=useState<{configured:boolean;displayName?:string}|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
 useEffect(()=>{let active=true;fetch('/api/memos').then(async r=>{if(!r.ok)throw Error();const data=await r.json();if(active){setOrigin(data.origin);setStatus(data);}}).catch(()=>{if(active)setError('接続設定を取得できませんでした。画面を再読み込みしてください。');});return()=>{active=false};},[]);
 async function action(method:'POST'|'DELETE'){
  setBusy(true);setError('');setMessage('');
  try{const r=await fetch('/api/memos',{method,headers:{'Content-Type':'application/json'},...(method==='POST'?{body:JSON.stringify({origin,...(token?{token}:{})})}:{})});const data=await r.json();if(!r.ok)throw Error(data.error);setStatus(data);setToken('');setMessage(method==='POST'?'接続を確認して保存しました。':'接続を解除しました。Memosのメモは残っています。');}
  catch(e){setError(e instanceof Error?e.message:'接続できませんでした。');}finally{setBusy(false);}
 }
 return <section className="memos-panel" aria-labelledby="memos-settings-title">
  <div className="memos-panel-heading"><div><h3 id="memos-settings-title">Memos連携</h3><p>記事から気づきを残し、Memosで読み返せます。</p></div><span>{status?.configured?'設定済み':'未設定'}</span></div>
  {status?.configured&&<p className="memos-help">接続アカウント：{status.displayName}</p>}
  <form onSubmit={e=>{e.preventDefault();void action('POST')}} className="memos-form">
   <label>接続先URL<input required type="url" value={origin} onChange={e=>setOrigin(e.target.value)} placeholder="https://memos.example.com" disabled={busy}/></label>
   <label>アクセストークン<input type="password" value={token} onChange={e=>setToken(e.target.value)} autoComplete="off" placeholder={status?.configured?'設定済み・変更する場合のみ入力':'Memosで発行したトークン'} disabled={busy}/></label>
   <p className="memos-help">Memosのユーザー設定で、Yomu専用のアクセストークンを発行してください。新しく保存するメモは非公開になります。</p>
   {error&&<p role="alert" className="memos-error">{error}</p>}{message&&<p role="status" className="memos-help">{message}</p>}
   <div className="memos-buttons"><button type="submit" className="memos-primary" disabled={busy||!status}>{busy?'確認中…':'接続を確認して保存'}</button>{status?.configured&&<button type="button" disabled={busy} onClick={()=>action('DELETE')}>連携を解除</button>}</div>
  </form>
 </section>;
}
