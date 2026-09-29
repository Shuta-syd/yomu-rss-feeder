"use client";
import type { JevSearchProgress } from '@/lib/jev-search';
export function SearchLoading({progress,semantic=false,onCancel,skeleton=false}:{progress?:JevSearchProgress|null;semantic?:boolean;onCancel?:()=>void;skeleton?:boolean}) {
  if(skeleton)return <div aria-hidden="true" className="space-y-3 overflow-hidden p-4">{Array.from({length:6},(_,i)=><div key={i} className="rounded-xl border p-4 motion-safe:animate-pulse" style={{borderColor:'var(--card-border)',background:'var(--card)'}}><div className="mb-3 h-3 w-24 rounded" style={{background:'var(--card-border)'}}/><div className="mb-2 h-4 w-5/6 rounded" style={{background:'var(--card-border)'}}/><div className="h-3 w-2/3 rounded" style={{background:'var(--card-border)'}}/></div>)}</div>;
  const titlePhase=progress?.stage!=='bodies';
  const done=titlePhase?progress?.titleChecked:progress?.bodyChecked;
  const total=titlePhase?progress?.titleTotal:progress?.bodyTotal;
  return <div className="my-2 rounded-xl border p-3" style={{borderColor:'var(--card-border)',background:'var(--card)'}}>
    <div className="flex items-center gap-3"><span aria-hidden="true" className="h-4 w-4 shrink-0 rounded-full border-2 border-current border-r-transparent motion-safe:animate-spin" style={{color:'var(--accent)'}}/>
    <p role="status" className="flex-1 text-sm font-medium">{!semantic?'記事を読み込み中…':progress?titlePhase?'タイトルの意味を確認中…':'候補の内容を確認中…':'Jev検索を準備中…'}</p>
    {onCancel&&<button type="button" onClick={onCancel} className="min-h-11 px-2 text-xs underline">中断</button>}</div>
    {semantic&&progress&&<><div className="mt-2 flex justify-between text-xs" style={{color:'var(--muted)'}}><span>{titlePhase?'1 / 2 · タイトル判定':'2 / 2 · 要約・本文抜粋の判定'}</span><span>{(done??0).toLocaleString()} / {(total??0).toLocaleString()}件</span></div>
    <div role="progressbar" aria-label={titlePhase?'タイトルの判定済み件数':'候補の確認済み件数'} aria-valuenow={done??0} aria-valuemin={0} aria-valuemax={Math.max(total??1,1)} className="mt-2 h-1.5 w-full overflow-hidden rounded-full" style={{background:'var(--card-border)'}}><div className="h-full rounded-full motion-safe:transition-[width]" style={{background:'var(--accent)',width:`${Math.min(100,100*(done??0)/Math.max(total??1,1))}%`}}/></div></>}
  </div>;
}
