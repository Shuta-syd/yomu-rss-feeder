"use client";

import { useId, useRef, useState } from "react";
import type { ArticleDTO } from "@/types/article";
import type { ArticleClassification } from "@/lib/llm/classification";
import { classificationGroups } from "@/lib/article-classification";
import styles from "./ClassificationEditor.module.css";

function tagsOf(raw: string | null): string[] {
  try { const tags: unknown = JSON.parse(raw ?? "[]"); return Array.isArray(tags) ? tags.filter((v): v is string => typeof v === "string") : []; }
  catch { return []; }
}
function selection(tags: string[]): ArticleClassification {
  return {
    genre: classificationGroups[0]!.values.find(v => tags.includes(`ジャンル:${v}`)) ?? "その他",
    industries: classificationGroups[1]!.values.filter(v => tags.includes(`業界:${v}`)).slice(0,3),
    topics: classificationGroups[2]!.values.filter(v => tags.includes(`テーマ:${v}`)).slice(0,3),
  };
}

export function ClassificationEditor({article,onChange}:{article:ArticleDTO;onChange:(a:ArticleDTO)=>void}) {
  const [open,setOpen]=useState(false);
  const [draft,setDraft]=useState(()=>selection(tagsOf(article.aiTags)));
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  const id=useId();
  const trigger=useRef<HTMLButtonElement>(null);
  const tags=tagsOf(article.aiTags);
  const displayTags=tags.some(tag=>/^(ジャンル|業界|テーマ):/.test(tag))?tags.filter(tag=>/^(ジャンル|業界|テーマ):/.test(tag)):tags;
  function edit(){setDraft(selection(tags));setError("");setMessage("");setOpen(true);}
  function close(){setOpen(false);trigger.current?.focus();}
  function toggle(field:"industries"|"topics",value:string){
    setDraft(current=>({...current,[field]:current[field].includes(value)?current[field].filter(v=>v!==value):[...current[field],value].slice(0,3)}));
  }
  async function save(){
    setSaving(true);setError("");
    try{
      const response=await fetch(`/api/articles/${article.id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({classification:draft})});
      if(!response.ok)throw new Error("save failed");
      onChange(await response.json());setMessage("分類を保存しました");close();
    }catch{setError("保存できませんでした。選択内容はそのままです。もう一度お試しください。");}
    finally{setSaving(false);}
  }
  return <div className={styles.root}>
    <div className={styles.tags}>
      {displayTags.map(tag=>/^(ジャンル|業界|テーマ):/.test(tag)
        ? <button key={tag} type="button" className={styles.tag} disabled={saving} onClick={edit} aria-label={`${tag}を編集`} aria-expanded={open} aria-controls={id}>{tag}</button>
        : <span key={tag} className={styles.tag}>{tag}</span>)}
      <button ref={trigger} type="button" className={styles.edit} disabled={saving} onClick={()=>open?close():edit()} aria-expanded={open} aria-controls={id}>分類を編集</button>
      {article.manualClassification && <span className={styles.manual} title="手動で修正した分類を保持しています">手動</span>}
    </div>
    {open && <section id={id} className={styles.panel} aria-label="分類の編集" onKeyDown={event=>{if(event.key==="Escape"&&!saving){event.preventDefault();close();}}}>
      <div className={styles.heading}><strong>この記事の分類</strong><span>AIの再処理でも保持されます</span></div>
      {classificationGroups.map((group,index)=>{
        const field=index===1?"industries":"topics";
        return <fieldset key={group.label} disabled={saving} className={styles.group}>
          <legend>{group.label}<span>{index===0?"1つ選択":`${draft[field].length} / 3`}</span></legend>
          <div className={styles.choices}>{group.values.map(value=>{
            const selected=index===0?draft.genre===value:draft[field].includes(value);
            return <button key={value} type="button" className={styles.choice} aria-pressed={selected}
              disabled={index!==0&&!selected&&draft[field].length>=3}
              onClick={()=>index===0?setDraft(current=>({...current,genre:value})):toggle(field,value)}>{value}</button>;
          })}</div>
        </fieldset>;
      })}
      {error&&<p role="alert" className={styles.error}>{error}</p>}
      <div className={styles.actions}><button type="button" onClick={close} disabled={saving}>キャンセル</button><button type="button" className={styles.save} onClick={save} disabled={saving}>{saving?"保存中…":"分類を保存"}</button></div>
    </section>}
    <p className={styles.status} role="status">{message}</p>
  </div>;
}
