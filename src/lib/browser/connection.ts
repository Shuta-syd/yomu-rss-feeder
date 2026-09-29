import { BrowserImportError, CAPTURE_EXPRESSION, matchingArticleUrl, validateBrowserCapture } from './article-import';
import {browserTargets,evaluateBrowser,openBrowserPage,closeBrowserPage} from './cdp';
import {ensureNikkeiLogin} from './login';
export {browserStatus} from './cdp';

async function waitForCapture(ws:string,url:string) {
 let last:unknown=null;
 for(let i=0;i<20;i++) {
  last=await evaluateBrowser(ws,`document.readyState === 'complete' ? (${CAPTURE_EXPRESSION}) : null`).catch(()=>null);
  if(last && matchingArticleUrl(String((last as {url?:string}).url??''),url))return last;
  await new Promise(resolve=>setTimeout(resolve,500));
 }
 return last;
}
export async function captureBrowserArticle(url:string) {
 if(!matchingArticleUrl(url,url))throw new BrowserImportError('現在のブラウザー取り込みは日経の記事に対応しています。');
 const existing=(await browserTargets()).find(t=>t.type==='page'&&matchingArticleUrl(t.url,url));
 if(!existing)await ensureNikkeiLogin();
 const tab=existing??await openBrowserPage(url);
 try {
  if(!tab.webSocketDebuggerUrl)throw new BrowserImportError('連携用Chromeで記事を開けませんでした。');
  const ws=tab.webSocketDebuggerUrl;
  let capture=await waitForCapture(ws,url);
  if((capture as {blocked?:boolean}|null)?.blocked) {
   const login=await ensureNikkeiLogin({sessionExpired:true});
   if(login.state==='logged_in') {
    await evaluateBrowser(ws,'location.reload(); true').catch(()=>{});
    await new Promise(resolve=>setTimeout(resolve,500));
    capture=await waitForCapture(ws,url);
   }
  }
  return validateBrowserCapture(capture,url);
 } finally {
  // Only close the temporary tab we opened, never a user's existing article tab.
  if(!existing)await closeBrowserPage(tab.id).catch(()=>{});
 }
}
