"use client";
import { useState } from "react";
import type { ArticleDTO } from "@/types/article";
import { ReaderIcon } from "@/components/ui/ReaderIcon";

export function ReadLaterButton({article, onChange}:{article:ArticleDTO;onChange:(article:ArticleDTO)=>void}) {
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  return <div className="reader-later-action"><button type="button" aria-pressed={!!article.isReadLater} disabled={busy} onClick={async()=>{
    setBusy(true);setError('');
    try { const res=await fetch(`/api/articles/${article.id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({isReadLater:!article.isReadLater})});if(!res.ok)throw Error('保存できませんでした。もう一度お試しください。');onChange(await res.json()); }
    catch(e){setError(e instanceof Error?e.message:'通信に失敗しました');}finally{setBusy(false);}
  }} aria-label={article.isReadLater?'あとで読むから解除':'あとで読むに追加'}><ReaderIcon name="bookmark" width="15" height="15"/>{busy?'保存中…':article.isReadLater?'保存済み':'あとで読む'}</button>{error&&<span role="alert">{error}</span>}</div>;
}
