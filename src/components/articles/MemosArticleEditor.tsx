"use client";
import "../memos.css";
import {useEffect,useState} from 'react';
import type {ArticleDTO} from '@/types/article';
import {previewTags} from '@/lib/article-preview';
import {composeMemoDraft} from '@/lib/memos/draft';
type Snapshot={saved:boolean;content:string;version:string|null;connectionId:string;url:string|null};
export function MemosArticleEditor({article,note}:{article:ArticleDTO;note:string}){
 const [snapshot,setSnapshot]=useState<Snapshot|null>(null),[content,setContent]=useState(''),[busy,setBusy]=useState(true),[error,setError]=useState(''),[message,setMessage]=useState('');
 const [tags,setTags]=useState<string[]>([]),[summary,setSummary]=useState(false),[dirty,setDirty]=useState(false),[confirmReload,setConfirmReload]=useState(false);
 const draftKey=`yomu:memos-draft:${article.id}`;
 function storedDraft(){try{return sessionStorage.getItem(draftKey);}catch{return null;}}
 function removeUnchangedDraft(before:string|null){try{if(sessionStorage.getItem(draftKey)===before)sessionStorage.removeItem(draftKey);}catch{}}
 async function load(){
  const before=storedDraft();
  setBusy(true);setError('');setMessage('');
  try{const r=await fetch(`/api/articles/${encodeURIComponent(article.id)}/memos`);const data=await r.json();if(!r.ok)throw Error(data.error);setSnapshot(data);setContent(data.saved?data.content:note);setDirty(false);setConfirmReload(false);removeUnchangedDraft(before);}
  catch(e){setError(e instanceof Error?e.message:'読み込めませんでした。');}finally{setBusy(false);}
 }
 useEffect(()=>{
  let active=true;
  setBusy(true);
  fetch(`/api/articles/${encodeURIComponent(article.id)}/memos`).then(async r=>{const data=await r.json();if(!r.ok)throw Error(data.error);if(!active)return;
   setSnapshot(data);setContent(data.saved?data.content:note);
   try{const raw=sessionStorage.getItem(draftKey);if(raw){const d=JSON.parse(raw);if(d.connectionId===data.connectionId && typeof d.content==="string" && Array.isArray(d.tags) && d.tags.every((t:unknown)=>typeof t==="string") && typeof d.summary==="boolean" && typeof d.saved==="boolean" && (d.version===null || typeof d.version==="string")){setContent(d.content);setTags(d.tags);setSummary(d.summary);setSnapshot({...data,version:d.version,saved:d.saved});setDirty(true);setMessage('編集中の内容を復元しました。');}}}catch{}
  }).catch(e=>{if(active)setError(e instanceof Error?e.message:'読み込めませんでした。');}).finally(()=>{if(active)setBusy(false)});
  return()=>{active=false};
  // This editor is mounted per article when the local memo section is opened.
  // eslint-disable-next-line react-hooks/exhaustive-deps
 },[article.id]);
 useEffect(()=>{if(!snapshot||!dirty)return;try{sessionStorage.setItem(draftKey,JSON.stringify({content,tags,summary,version:snapshot.version,saved:snapshot.saved,connectionId:snapshot.connectionId}));}catch{}},[content,tags,summary,dirty,snapshot,draftKey]);
 const finalContent=snapshot?.saved?content:composeMemoDraft({note:content,title:article.aiTitleJa||article.title,url:article.url,tags,summary:summary?article.aiSummaryShort??undefined:undefined});
 async function save(){
  if(!snapshot)return;const before=storedDraft();setBusy(true);setError('');setMessage('');
  try{const r=await fetch(`/api/articles/${encodeURIComponent(article.id)}/memos`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({content:finalContent,version:snapshot.version,connectionId:snapshot.connectionId})});const data=await r.json();if(!r.ok)throw Error(data.error);setSnapshot(data);setContent(data.content);setDirty(false);setMessage('Memosに保存しました。');removeUnchangedDraft(before);}
  catch(e){setError(e instanceof Error?e.message:'保存できませんでした。');}finally{setBusy(false);}
 }
 return <section className="memos-article" aria-label="Memosに保存">
  <div className="memos-panel-heading"><h3>Memosに残す</h3>{snapshot?.saved&&snapshot.url&&<a href={snapshot.url} target="_blank" rel="noopener noreferrer">保存済み · Memosで開く ↗</a>}</div>
  {!snapshot&&!busy&&<a href="/settings?tab=integration">設定でMemosを接続する →</a>}
  {snapshot&&<>
   <label className="memos-field">{snapshot.saved?'Memosの本文（Markdown）':'自分の気づき'}<textarea value={content} rows={5} disabled={busy} onChange={e=>{setContent(e.target.value);setDirty(true)}} placeholder="この記事から考えたこと、覚えておきたいこと"/></label>
   {!snapshot.saved&&<>
    {previewTags(article.aiTags).length>0&&<fieldset className="memos-tags"><legend>添付するタグ</legend>{previewTags(article.aiTags).map(tag=><label key={tag}><input type="checkbox" checked={tags.includes(tag)} disabled={busy} onChange={e=>{setTags(old=>e.target.checked?[...old,tag]:old.filter(x=>x!==tag));setDirty(true)}}/>{tag.replace(/^[^:]+:/,'')}</label>)}</fieldset>}
    {article.aiSummaryShort&&<label className="memos-summary"><input type="checkbox" checked={summary} disabled={busy} onChange={e=>{setSummary(e.target.checked);setDirty(true)}}/>既存のAI要約も添付する</label>}
    <details className="memos-preview"><summary>保存内容を確認</summary><pre>{finalContent}</pre></details>
   </>}
  </>}
  {error&&<p role="alert" className="memos-error">{error}</p>}{message&&<p role="status" className="memos-help">{message}</p>}
  <div className="memos-buttons">{snapshot&&<button type="button" className="memos-primary" disabled={busy||!finalContent.trim()} onClick={save}>{busy?'処理中…':snapshot.saved?'Memosを更新':'Memosに保存'}</button>}<button type="button" disabled={busy} onClick={()=>{if(dirty)setConfirmReload(true);else void load()}}>{busy?'確認中…':'最新の内容を読み込む'}</button></div>
  {confirmReload&&<div className="memos-reload"><p>編集中の内容を置き換えます。必要な文章をコピーしてから読み込んでください。</p><div className="memos-buttons"><button type="button" onClick={load}>編集内容を破棄して読み込む</button><button type="button" onClick={()=>setConfirmReload(false)}>編集を続ける</button></div></div>}
 </section>;
}
