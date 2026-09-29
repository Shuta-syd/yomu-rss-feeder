export function composeMemoDraft(input:{note:string;title:string;url:string;tags:string[];summary?:string}) {
 const title=input.title.replace(/[\\`*_{}[\]<>#]/g,'\\$&').replace(/\s+/g,' ').trim();
 let url:string;try{const parsed=new URL(input.url);if(!['https:','http:'].includes(parsed.protocol))throw Error();url=parsed.href.replace(/\(/g,'%28').replace(/\)/g,'%29');}catch{url='';}
 const tags=input.tags.map(t=>'#'+t.replace(/^[^:]+:/,'').replace(/[^\p{L}\p{N}_/-]/gu,'_')).join(' ');
 return [input.note.trim(),url?`[${title}](${url})`:title,input.summary?`### 記事の要約\n${input.summary.trim()}`:'',tags].filter(Boolean).join('\n\n');
}
