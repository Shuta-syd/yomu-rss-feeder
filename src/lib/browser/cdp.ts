import {request} from 'node:http';
import {lookup} from 'node:dns/promises';
import {BrowserImportError} from './article-import';
export type Target = {id:string;type:string;url:string;webSocketDebuggerUrl?:string};
function endpoint(): URL {
  const setting = process.env.YOMU_BROWSER_CDP_URL;
  if (!setting) throw new BrowserImportError('ブラウザー連携が未設定です。設定の「連携」を確認してください。');
  const url = new URL(setting);
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]', 'yomu-browser'].includes(url.hostname) || url.username || url.password) {
    throw new BrowserImportError('連携先はこのサーバーのローカルChromeに限定されています。');
  }
  return url;
}
export async function browserTargets(): Promise<Target[]> {
  const base = endpoint();
  try {
    const data = JSON.parse(await requestBrowser(new URL('/json/list',base),'GET',browserHeaders(base)));
    if (!Array.isArray(data)) throw new Error('invalid');
    return data.map((target:Target)=>normalizeTarget(target,base));
  } catch { throw new BrowserImportError('連携用Chromeに接続できません。Chromeを起動してください。'); }
}
export async function browserStatus() {
  if (!process.env.YOMU_BROWSER_CDP_URL) return {configured:false, connected:false};
  try { await browserTargets(); return {configured:true,connected:true}; }
  catch { return {configured:true,connected:false}; }
}
export async function evaluateBrowser(wsUrl:string,expression:string):Promise<unknown> {
 const result=await browserCommand(wsUrl,'Runtime.evaluate',{expression,returnByValue:true,timeout:5000});
 return (result as {result?:{value?:unknown}})?.result?.value;
}
export async function insertBrowserText(wsUrl:string,text:string):Promise<void> {
 if(!/^\d$/.test(text))throw new BrowserImportError('確認コードを確認してください。');
 await browserCommand(wsUrl,'Input.insertText',{text});
}
async function browserCommand(wsUrl:string,method:string,params:Record<string,unknown>):Promise<unknown> {
  const base = endpoint(), ws = new URL(wsUrl);
  if (ws.protocol !== 'ws:' || ws.host !== base.host) throw new BrowserImportError('ブラウザーの接続先を確認できませんでした。');
  // Chrome also validates Host during the WebSocket upgrade. Resolve only the
  // configured Docker service, after checking the returned target host above.
  if(base.hostname==='yomu-browser')ws.hostname=(await lookup(base.hostname,{family:4})).address;
  return new Promise((resolve,reject) => {
    const socket = new WebSocket(ws);
    let settled=false;
    const finish = (error?:Error, value?:unknown) => {if(settled)return;settled=true;clearTimeout(timer);socket.close();if(error)reject(error);else resolve(value);};
    const timer = setTimeout(() => finish(new BrowserImportError('本文の読み取りがタイムアウトしました。')),8000);
    socket.addEventListener('open', () => socket.send(JSON.stringify({id:1,method,params})));
    socket.addEventListener('error', () => finish(new BrowserImportError('ブラウザーとの通信に失敗しました。')));
    socket.addEventListener('close', () => {clearTimeout(timer);reject(new BrowserImportError('ブラウザーとの接続が閉じられました。'));});
    socket.addEventListener('message', event => {
      try {
        if (typeof event.data !== 'string' || event.data.length > 2_500_000) throw new Error('invalid');
        const data = JSON.parse(event.data);
        if (data.id !== 1) return;
        if (data.error || data.result?.exceptionDetails) throw new Error('evaluation');
        finish(undefined,data.result);
      } catch { finish(new BrowserImportError('本文を読み取れませんでした。記事を開き直してください。')); }
    });
  });
}

export async function openBrowserPage(url:string):Promise<Target>{
 const page=new URL(url);
 if(page.origin!=='https://www.nikkei.com'||page.username||page.password)throw new BrowserImportError('日経以外のページは開けません。');
 const base=endpoint();
 const response=await requestBrowser(new URL('/json/new?'+encodeURIComponent(url),base),'PUT',browserHeaders(base));
 return normalizeTarget(JSON.parse(response) as Target,base);
}

function browserHeaders(base:URL):Record<string,string> {
 return base.hostname==='yomu-browser'?{Host:'localhost:9222'}:{};
}
export function normalizeTarget(target:Target,base:URL):Target {
 if(base.hostname!=='yomu-browser'||!target.webSocketDebuggerUrl)return target;
 const ws=new URL(target.webSocketDebuggerUrl);
 if(ws.protocol!=='ws:'||ws.hostname!=='localhost'||ws.port!=='9222'||!ws.pathname.startsWith('/devtools/page/'))throw new BrowserImportError('連携先の応答を確認できませんでした。');
 ws.host=base.host;
 return {...target,webSocketDebuggerUrl:ws.href};
}
export async function closeBrowserPage(id:string){
 const base=endpoint();
 await requestBrowser(new URL('/json/close/'+encodeURIComponent(id),base),'GET',browserHeaders(base));
}

// node:http preserves Host; Node fetch drops this override. Never follow redirects.
export function requestBrowser(url:URL,method:'GET'|'PUT',headers:Record<string,string>):Promise<string> {
 return new Promise((resolve,reject)=>{
  const req=request(url,{method,headers,signal:AbortSignal.timeout(5000)},res=>{
   if(res.statusCode!==200){res.resume();reject(new BrowserImportError('ブラウザーから正常な応答がありませんでした。'));return;}
   const chunks:Buffer[]=[];let size=0;
   res.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>2_500_000){req.destroy(new Error('response too large'));return;}chunks.push(chunk);});
   res.on('end',()=>resolve(Buffer.concat(chunks).toString('utf8')));
   res.on('error',()=>reject(new BrowserImportError('ブラウザーの応答を読み取れませんでした。')));
  });
  req.on('error',()=>reject(new BrowserImportError('連携用Chromeに接続できません。')));
  req.end();
 });
}
