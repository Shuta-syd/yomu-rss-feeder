"use client";
import {useEffect,useId,useRef,useState} from 'react';
import {classificationGroups} from '@/lib/article-classification';
import type {FilterConditions,SavedFilter} from '@/lib/saved-filters';
import {ReaderIcon} from '@/components/ui/ReaderIcon';

export function ClassificationFilters({conditions,onClassifications,onApply}:{conditions:FilterConditions;onClassifications:(values:string[])=>void;onApply:(value:FilterConditions)=>void}){
 const [saved,setSaved]=useState<SavedFilter[]>([]);
 const [editing,setEditing]=useState(false),[managing,setManaging]=useState(false);
 const [name,setName]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const [draft,setDraft]=useState<string[]>([]);
 const dialog=useRef<HTMLDialogElement>(null),nameInput=useRef<HTMLInputElement>(null);
 const titleId=useId();
 useEffect(()=>{
  let active=true;
  fetch('/api/saved-filters').then(async r=>{if(!r.ok)throw new Error('保存条件を取得できませんでした');return r.json();})
   .then(data=>{if(active)setSaved(data)}).catch(e=>{if(active)setMessage(e.message)});
  return()=>{active=false};
 },[]);
 useEffect(()=>{if(editing)nameInput.current?.focus();},[editing]);
 function openFilters(){setDraft(conditions.classifications);dialog.current?.showModal();}
 function startSaving(){
  setName((conditions.classifications.map(v=>v.split(':')[1]).join(' × ')||conditions.search||conditions.category||'マイ条件').slice(0,40));
  setEditing(true);setMessage('');
 }
 async function remove(filter:SavedFilter){
  setBusy(true);setMessage('');
  try{const r=await fetch('/api/saved-filters?id='+encodeURIComponent(filter.id),{method:'DELETE'});const data=await r.json();if(!r.ok)throw new Error(data.error);setSaved(data);setMessage(`「${filter.name}」を削除しました`);}
  catch(e){setMessage(e instanceof Error?e.message:'削除できませんでした')}finally{setBusy(false)}
 }
 const currentKey=JSON.stringify(conditions);
 return <section className="reader-filters" aria-label="分類と保存条件">
  <div className="reader-filter-heading">
   <button className="reader-filter-trigger" onClick={openFilters} aria-haspopup="dialog"><ReaderIcon name="filter"/>絞り込み{conditions.classifications.length>0&&<span className="reader-count">{conditions.classifications.length}</span>}</button>
   {conditions.classifications.length>0&&<button className="reader-text-button" onClick={()=>onClassifications([])}>クリア</button>}
   <button className="reader-text-button reader-save-trigger" onClick={startSaving}><ReaderIcon name="bookmark"/>条件を保存</button>
  </div>
  {conditions.classifications.length>0&&<div className="reader-active-filters" aria-label="適用中の分類">{conditions.classifications.map(value=><button key={value} className="reader-active-chip" onClick={()=>onClassifications(conditions.classifications.filter(v=>v!==value))} aria-label={`${value}を解除`}><span>{value.split(':')[1]}</span><ReaderIcon name="close" width="14" height="14"/></button>)}</div>}
  {saved.length>0&&<div className="reader-presets-row">
   <div className="reader-presets" aria-label="保存した絞り込み">{saved.map(filter=><div key={filter.id} className="reader-preset" data-active={currentKey===JSON.stringify(filter.conditions)}>
    <button className="reader-preset-apply" title={filter.name} onClick={()=>{onApply(filter.conditions);setMessage(`「${filter.name}」を適用しました`);setEditing(false)}}><ReaderIcon name="bookmark" width="14" height="14"/><span>{filter.name}</span></button>
    {managing&&<button disabled={busy} className="reader-preset-delete" onClick={()=>remove(filter)} aria-label={`保存条件「${filter.name}」を削除`}><ReaderIcon name="close" width="16" height="16"/></button>}
   </div>)}</div>
   <button className="reader-text-button reader-manage" aria-pressed={managing} onClick={()=>setManaging(v=>!v)}>{managing?'完了':'管理'}</button>
  </div>}
  {editing&&<form className="reader-save-form" onSubmit={async e=>{
   e.preventDefault();setBusy(true);setMessage('');
   try{const r=await fetch('/api/saved-filters',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,conditions})});const data=await r.json();if(!r.ok)throw new Error(data.error);setSaved(data);setEditing(false);setMessage(`「${name.trim()}」を保存しました`)}catch(e){setMessage(e instanceof Error?e.message:'保存できませんでした')}finally{setBusy(false)}
  }}>
   <label htmlFor={`${titleId}-name`}>この条件に名前をつける</label>
   <input id={`${titleId}-name`} ref={nameInput} aria-label="保存条件の名前" required maxLength={40} value={name} onChange={e=>setName(e.target.value)}/>
   <div><span>検索・未読状態・対象フィードも保存</span><button type="button" className="reader-text-button" onClick={()=>setEditing(false)}>取消</button><button disabled={busy||!name.trim()} className="reader-primary">保存</button></div>
  </form>}
  {message&&<p className="reader-filter-status" role="status">{message}</p>}
  <dialog ref={dialog} className="reader-filter-dialog" aria-labelledby={titleId} onClick={e=>{if(e.target===dialog.current){const r=dialog.current.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.current.close();}}}>
   <div className="reader-dialog-header"><div><h2 id={titleId}>記事を絞り込む</h2><p>ジャンル・業界・テーマを組み合わせる</p></div><button className="reader-icon-button" aria-label="絞り込みを閉じる" onClick={()=>dialog.current?.close()}><ReaderIcon name="close"/></button></div>
   <form onSubmit={e=>{e.preventDefault();onClassifications(draft);setMessage('');dialog.current?.close();}}>
    <div className="reader-filter-options">{classificationGroups.map(group=><fieldset key={group.label}><legend>{group.label}</legend><div className="reader-choice-grid">{['',...group.values].map(label=>{
     const value=label?`${group.label}:${label}`:'';
     const selected=draft.find(v=>v.startsWith(group.label+':'))??'';
     return <label className="reader-choice" key={value}><input type="radio" name={`${titleId}-${group.label}`} value={value} checked={selected===value} onChange={()=>setDraft(classificationGroups.flatMap(g=>{const v=g.label===group.label?value:draft.find(t=>t.startsWith(g.label+':'));return v?[v]:[]}))}/><span>{label||'すべて'}</span></label>;
    })}</div></fieldset>)}</div>
    <div className="reader-dialog-footer"><button type="button" className="reader-text-button" onClick={()=>setDraft([])}>すべてクリア</button><button className="reader-primary">この条件で表示{draft.length>0?`（${draft.length}）`:''}</button></div>
   </form>
  </dialog>
 </section>;
}
