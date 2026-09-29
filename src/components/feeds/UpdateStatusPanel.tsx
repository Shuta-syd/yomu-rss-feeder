"use client";
import {useCallback,useEffect,useRef,useState} from 'react';
import {AI_PAUSE_LABELS,type AIUpdateStatus,type FeedUpdateStatus} from '@/lib/update-status';
export function UpdateStatusPanel({ai,onUpdated,syncing=false,syncError}:{ai:AIUpdateStatus|null;onUpdated:()=>void;syncing?:boolean;syncError?:string|null}) {
 const [feeds,setFeeds]=useState<FeedUpdateStatus[]>([]);
 const [loaded,setLoaded]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [retrying,setRetrying]=useState<string|null>(null);
 const inFlight=useRef(false),generation=useRef(0);
 const load=useCallback(async()=>{
  const request=++generation.current;
  try {const r=await fetch('/api/feeds/status');if(!r.ok)throw new Error();const data=await r.json();if(request!==generation.current)return;setFeeds(data.feeds);setLoaded(true);setError('');}
  catch{if(request===generation.current)setError('更新状況を確認できません。通信状態を確認して再表示してください。');}
 },[]);
 useEffect(()=>{void load();const timer=setInterval(()=>{if(!document.hidden)void load();},30000);return()=>{clearInterval(timer);};},[load,syncing]);
 const retry=async(feedId?:string)=>{
  if(inFlight.current||syncing)return;inFlight.current=true;setRetrying(feedId??'all');setNotice('');
  try {
   const r=await fetch('/api/sync',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(feedId?{feedId}:{failedOnly:true})});
   const result=await r.json();
   if(!r.ok)throw new Error(r.status===409?'ほかの更新が進行中です。完了してから再試行してください。':'再取得できませんでした。通信状態を確認してください。');
   const failures=Array.isArray(result.errors)?result.errors.length:0;
   setNotice(`${result.aborted?'更新が途中で停止しました。':'再取得が完了しました。'} 成功 ${result.updated}件・失敗 ${failures}件・新着 ${result.newArticles}件`);
   onUpdated();
  } catch(e){setNotice(e instanceof Error&&/^(ほかの更新|再取得できません)/.test(e.message)?e.message:'再取得に失敗しました。通信状態を確認してください。');}
  finally{await load();inFlight.current=false;setRetrying(null);}
 };
 const failed=feeds.filter(f=>f.lastFetchStatus==='error');
 const sorted=[...feeds].sort((a,b)=>Number(b.lastFetchStatus==='error')-Number(a.lastFetchStatus==='error')||a.title.localeCompare(b.title,'ja'));
 const busy=syncing||retrying!==null;
 const pause=ai?.pauseReason;
 return <details className="border-b text-xs" style={{borderColor:'var(--card-border)',background:'var(--bg)'}}>
  <summary className="min-h-11 cursor-pointer px-3 py-3" aria-label="フィードとAIの更新状況">
   <span className="font-medium">更新状況</span>
   {failed.length>0&&<span className="ml-2" style={{color:'var(--accent)'}}>取得失敗 {failed.length}件</span>}
   {(error||syncError)&&<span className="ml-2">状況を確認できません</span>}
   {pause&&<span className="ml-2" style={{color:'var(--accent)'}}>{AI_PAUSE_LABELS[pause]}</span>}
   {!pause&&(ai?.processing??0)>0&&<span className="ml-2" style={{color:'var(--muted)'}}>AI処理中 {ai?.processing}件</span>}
   {!pause&&ai?.processing===0&&ai.pending>0&&<span className="ml-2" style={{color:'var(--muted)'}}>AI待機 {ai.pending}件</span>}
   {(ai?.failed??0)>0&&<span className="ml-2">AI失敗 {ai?.failed}件</span>}
  </summary>
  <div className="max-h-[55vh] space-y-3 overflow-y-auto border-t p-3" style={{borderColor:'var(--card-border)'}}>
   <section className="space-y-2 rounded-lg p-3" style={{background:'var(--card)'}}>
    <h3 className="font-semibold">AIの分類・要約</h3>
    {!ai?<p>状態を確認中…</p>:<>
     <p>処理中 {ai.processing}件 ／ 待機 {ai.pending}件 ／ 失敗 {ai.failed}件</p>
     {pause==='budget'&&<p className="leading-relaxed">前回の予算チェックで処理が保留されました。次の処理に必要な概算額を確保できると再開します。</p>}
     {pause==='pricing'&&<p>使用モデルの単価が未登録のため、処理を待機しています。</p>}
     {pause==='api_key'&&<p>使用するAIのAPIキーが未登録です。</p>}
     {!pause&&ai.processing===0&&ai.pending>0&&<p>次の自動処理を待っています。</p>}
     {ai.processing>0&&ai.currentFeedTitle&&<p className="break-words">{ai.currentFeedTitle}{ai.currentTitle?`：${ai.currentTitle}`:''}</p>}
     {ai.failed>0&&<p>処理に失敗した記事があります。各記事のAI処理から再試行できます。</p>}
     {(pause||ai.failed>0)&&<a className="inline-flex min-h-11 items-center underline" href="/settings?tab=ai">AIの設定・予算を確認 →</a>}
    </>}
   </section>
   <div className="flex flex-wrap items-center justify-between gap-2">
    <h3 className="font-semibold">フィード全体{loaded?`（${feeds.length}件）`:''}</h3>
    {failed.length>0&&<button type="button" disabled={busy} onClick={()=>void retry()} className="min-h-11 rounded-lg px-3 py-2 disabled:opacity-50" style={{background:'var(--accent-subtle)',color:'var(--accent)'}}>{retrying==='all'?'再取得中…':'失敗したフィードだけ再取得'}</button>}
   </div>
   {syncError&&<p role="status">{syncError}</p>}
   {notice&&<p role="status" className="leading-relaxed">{notice}</p>}
   {error&&<div role="status"><p>{error}</p><button className="min-h-11 underline" onClick={()=>void load()}>状況を再表示</button></div>}
   {!loaded&&!error&&<p>更新状況を確認中…</p>}
   {loaded&&feeds.length===0&&<p>登録されたフィードはありません。</p>}
   <ul className="space-y-2">{sorted.map(feed=><li key={feed.id} className="rounded-lg border p-3" style={{borderColor:'var(--card-border)',background:'var(--card)'}}>
    <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="break-words text-sm font-medium">{feed.title}</p><p className="mt-1" style={{color:'var(--muted)'}}>{feed.category}</p></div><span className="shrink-0">{feed.lastFetchStatus==='error'?'取得失敗':feed.lastFetchStatus==='ok'?'取得成功':'未取得'}</span></div>
    <p className="mt-2" style={{color:'var(--muted)'}}>{feed.lastFetchStatus==='ok'?'最終更新':'最終チェック'}：{feed.lastFetchedAt?new Date(feed.lastFetchedAt).toLocaleString('ja-JP'):'まだ取得していません'}</p>
    {feed.lastFetchStatus==='error'&&<><p className="mt-2 break-words leading-relaxed">{feed.lastFetchError}（{Math.max(1,feed.consecutiveFetchFailures)}回連続）</p><button type="button" disabled={busy} onClick={()=>void retry(feed.id)} className="mt-2 min-h-11 rounded-lg border px-3 py-2 disabled:opacity-50" style={{borderColor:'var(--card-border)'}}>{retrying===feed.id?'再取得中…':'このフィードを再取得'}</button></>}
   </li>)}</ul>
  </div>
 </details>;
}
