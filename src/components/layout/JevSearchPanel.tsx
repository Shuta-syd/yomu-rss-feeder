"use client";
import { useEffect, useState } from 'react';
export function JevSearchPanel() {
  const [enabled, setEnabled] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [key, setKey] = useState('');
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);
  useEffect(() => {
    fetch('/api/settings').then(async r => { if (!r.ok) throw new Error(); return r.json(); }).then(s => {
      setEnabled(s.jevSearchEnabled); setConfigured(s.hasJevApiKey); setReady(true);
    }).catch(() => { setError(true); setMessage('設定を読み込めませんでした。ページを再読み込みしてください。'); });
  }, []);
  async function save(remove = false) {
    setBusy(true);setMessage('');setError(false);
    try {
      const response = await fetch('/api/settings', {method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({
        jevSearchEnabled: remove ? false : enabled,
        ...(remove ? {jevApiKey:null} : key.trim() ? {jevApiKey:key.trim()} : {}),
      })});
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? '保存できませんでした。');
      setEnabled(data.jevSearchEnabled);setConfigured(data.hasJevApiKey);setKey('');setMessage('保存しました。');
    } catch (e) {setError(true);setMessage(e instanceof Error ? e.message : '保存できませんでした。');}
    finally {setBusy(false);}
  }
  return <section className="rounded-lg border p-4 space-y-3" style={{borderColor:'var(--card-border)'}} aria-labelledby="jev-search-title">
    <h2 id="jev-search-title" className="font-semibold">Jev検索</h2>
    <p className="text-sm" style={{color:'var(--muted)'}}>「面接について」のような言葉で検索し、内容が関連する記事を関連度順に表示します。</p>
    <label className="flex items-center gap-3 min-h-11 cursor-pointer">
      <input type="checkbox" role="switch" aria-label="Jev検索を使う" checked={enabled} disabled={!ready || busy} onChange={e=>setEnabled(e.target.checked)} className="peer sr-only"/>
      <span aria-hidden="true" className="relative h-6 w-11 shrink-0 rounded-full bg-gray-400 transition-colors peer-checked:bg-[var(--accent)] peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-disabled:opacity-50 after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-5"/>
      <span>Jev検索を使う</span>
    </label>
    <label className="block text-sm" htmlFor="jev-api-key">TypeSafe APIキー {configured ? '（登録済み）' : '（未登録）'}</label>
    <input id="jev-api-key" type="password" autoComplete="new-password" value={key} disabled={!ready || busy} onChange={e=>setKey(e.target.value)} placeholder={configured ? '変更するときだけ入力' : 'TypeSafeのAPIキーを入力'} className="w-full rounded border px-3 py-2" style={{background:'var(--bg)',borderColor:'var(--card-border)'}}/>
    <p className="text-xs" style={{color:'var(--muted)'}}>候補探しには下のStage1のAI設定を使い、Jevには検索文と候補記事のタイトル・要約・本文の一部を送信します。両方の利用料をAI予算に含めます。OFFにすると従来の全文検索を使います。</p>
    <div className="flex gap-3"><button type="button" disabled={!ready || busy} onClick={()=>void save()} className="rounded px-4 py-2" style={{background:'var(--accent)',color:'white'}}>{busy ? '保存中…' : '検索設定を保存'}</button>
    {configured && <button type="button" disabled={busy} onClick={()=>void save(true)} className="underline px-2">キーを削除</button>}</div>
    {message && <p role={error ? 'alert' : 'status'} className="text-sm">{message}</p>}
  </section>;
}
