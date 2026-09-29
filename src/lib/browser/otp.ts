import {rawDb} from '../db';
import {BrowserImportError} from './article-import';
import {browserTargets,evaluateBrowser,insertBrowserText} from './cdp';
import {claimOtpAttempt,finishLoginAttempt} from './login-settings';
import {LOGIN_STATE_EXPRESSION,otpFocusExpression,type LoginPageState} from './login-dom';
const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
export async function submitNikkeiOtp(code:string) {
 if(!/^\d{6}$/.test(code))throw new BrowserImportError('確認コードを6桁の数字で入力してください。');
 if(!claimOtpAttempt())throw new BrowserImportError('確認コードを送信できる状態ではありません。接続状態を確認してください。');
 try {
  const id=(rawDb.prepare("SELECT value FROM app_config WHERE key='nikkei_login_tab'").get() as {value:string}|undefined)?.value;
  const tab=(await browserTargets()).find(t=>t.type==='page'&&t.id===id);
  if(!tab?.webSocketDebuggerUrl)return finishLoginAttempt('disconnected');
  const url=new URL(tab.url);
  if(url.origin!=='https://id.nikkei.com'||url.pathname!=='/login/challenge')return finishLoginAttempt('manual_required');
  const ws=tab.webSocketDebuggerUrl;
  const state=await evaluateBrowser(ws,LOGIN_STATE_EXPRESSION) as LoginPageState;
  if(state==='otp_expired')return finishLoginAttempt('otp_expired');
  if(state!=='otp_required'&&state!=='otp_invalid')return finishLoginAttempt('manual_required');
  for(let i=0;i<6;i++) {
   if(!await evaluateBrowser(ws,otpFocusExpression(i)))return finishLoginAttempt('manual_required');
   await insertBrowserText(ws,code.charAt(i));
  }
  // Submission is driven by Nikkei's real input events. Never resend automatically.
  for(let i=0;i<20;i++) {
   await sleep(500);
   const next=await evaluateBrowser(ws,LOGIN_STATE_EXPRESSION).catch(()=> 'waiting') as LoginPageState;
   if(next==='logged_in'||next==='otp_invalid'||next==='otp_expired'||next==='failed'||next==='manual_required')return finishLoginAttempt(next);
  }
  return finishLoginAttempt('otp_required');
 } catch {
  // Browser errors may contain injected values. Do not expose or log them.
  return finishLoginAttempt('disconnected');
 }
}
