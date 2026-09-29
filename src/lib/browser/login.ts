import {rawDb} from '../db';
import {browserTargets,evaluateBrowser,openBrowserPage,type Target} from './cdp';
import {claimLoginAttempt,finishLoginAttempt,getLoginCredentials,getLoginSettings} from './login-settings';
import {fillLoginExpression,LOGIN_STATE_EXPRESSION,SUBMIT_LOGIN_EXPRESSION,type LoginPageState} from './login-dom';
const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
async function loginTab():Promise<Target>{
 const id=(rawDb.prepare("SELECT value FROM app_config WHERE key='nikkei_login_tab'").get() as {value:string}|undefined)?.value;
 const existing=(await browserTargets()).find(t=>t.id===id&&t.type==='page');
 if(existing?.webSocketDebuggerUrl){
  await evaluateBrowser(existing.webSocketDebuggerUrl,"location.href='https://www.nikkei.com/'; true").catch(()=>{});
  return existing;
 }
 const tab=await openBrowserPage('https://www.nikkei.com/');
 rawDb.prepare("INSERT INTO app_config(key,value) VALUES('nikkei_login_tab',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(tab.id);
 return tab;
}
export async function ensureNikkeiLogin(options:{force?:boolean;sessionExpired?:boolean}={}){
 const settings=getLoginSettings();
 // Session expiry bypasses the healthy-session interval, never a failed-password stop.
 const force=options.force || (options.sessionExpired && settings.state==='logged_in');
 if(!claimLoginAttempt(force))return getLoginSettings();
 try{
  const credentials=getLoginCredentials();if(!credentials)return finishLoginAttempt('failed');
  const tab=await loginTab();if(!tab.webSocketDebuggerUrl)return finishLoginAttempt('disconnected');
  const ws=tab.webSocketDebuggerUrl;
  let emailSent=false,passwordSent=false,navigated=false;
  const deadline=Date.now()+45000;
  while(Date.now()<deadline){
   await sleep(700);
   const state=await evaluateBrowser(ws,LOGIN_STATE_EXPRESSION).catch(()=> 'waiting') as LoginPageState;
   if(state==='logged_in')return finishLoginAttempt('logged_in');
   if(state==='manual_required'||state==='failed'||state==='otp_required'||state==='otp_invalid'||state==='otp_expired')return finishLoginAttempt(state);
   if(state==='login_required'&&!navigated){
    navigated=true;await evaluateBrowser(ws,"location.href='https://www.nikkei.com/login'; true").catch(()=>{});continue;
   }
   if((state==='email'&&!emailSent)||(state==='password'&&!passwordSent)){
    const kind=state==='email'?'email':'password';
    const filled=await evaluateBrowser(ws,fillLoginExpression(kind,credentials[kind]));
    if(!filled)return finishLoginAttempt('manual_required');
    if(kind==='email')emailSent=true;else passwordSent=true;
    await sleep(150);
    // A navigation can destroy the execution context after the click. Never submit twice.
    const submitted=await evaluateBrowser(ws,SUBMIT_LOGIN_EXPRESSION).catch(()=>true);
    if(!submitted)return finishLoginAttempt('manual_required');
   }
  }
  return finishLoginAttempt('manual_required');
 }catch{
  // Browser/CDP errors may contain URLs or injected expressions: never log them.
  return finishLoginAttempt('disconnected');
 }
}
