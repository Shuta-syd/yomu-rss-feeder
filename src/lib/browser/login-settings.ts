import {rawDb} from '../db';
import {encrypt,decrypt} from '../crypto';
export type LoginState='idle'|'running'|'logged_in'|'manual_required'|'otp_required'|'otp_invalid'|'otp_expired'|'failed'|'disconnected';
type Settings={enabled:boolean;credentials?:string;state:LoginState;checkedAt:number|null;attemptAt:number|null};
const KEY='nikkei_auto_login';
function read():Settings {
 const row=rawDb.prepare('SELECT value FROM app_config WHERE key=?').get(KEY) as {value:string}|undefined;
 return row?JSON.parse(row.value):{enabled:false,state:'idle',checkedAt:null,attemptAt:null};
}
function write(value:Settings){rawDb.prepare('INSERT INTO app_config(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(KEY,JSON.stringify(value));}
export function getLoginSettings(){const s=read();return {enabled:s.enabled,hasCredentials:!!s.credentials,state:s.state==='running'&&Date.now()-(s.attemptAt??0)>=120000?'manual_required':s.state,checkedAt:s.checkedAt};}
export function getLoginCredentials():{email:string;password:string}|null{const s=read();return s.credentials?JSON.parse(decrypt(s.credentials)):null;}
export function saveLoginSettings(input:{enabled:boolean;email?:string;password?:string}){
 rawDb.transaction(()=>{
  const s=read();if(s.state==='running'&&Date.now()-(s.attemptAt??0)<120000)throw new Error('ログイン処理が終わってから設定を変更してください。');
  if(input.email!==undefined||input.password!==undefined){
   if(!input.email?.trim()||!input.password)throw new Error('メールアドレスとパスワードを両方入力してください。');
   s.credentials=encrypt(JSON.stringify({email:input.email.trim(),password:input.password}));
  }
  if(input.enabled&&!s.credentials)throw new Error('日経のログイン情報を登録してください。');
  write({...s,enabled:input.enabled,state:'idle',checkedAt:null,attemptAt:null});
 }).immediate();return getLoginSettings();
}
export function clearLoginCredentials(){
 rawDb.transaction(()=>{if(read().state==='running'&&Date.now()-(read().attemptAt??0)<120000)throw new Error('ログイン処理が終わってから削除してください。');write({enabled:false,state:'idle',checkedAt:null,attemptAt:null});}).immediate();
}
export function claimLoginAttempt(force=false):boolean{
 return rawDb.transaction(()=>{
  const s=read(),now=Date.now();
  if(!s.enabled||!s.credentials)return false;
  if(s.state==='running'){
   if(now-(s.attemptAt??now)<120000)return false;
   if(!force){write({...s,state:'manual_required',checkedAt:now});return false;}
  }
  if(!force && (['manual_required','failed','otp_required','otp_invalid','otp_expired'].includes(s.state)))return false;
  if(!force && s.checkedAt && now-s.checkedAt<(s.state==='logged_in'?15*60000:5*60000))return false;
  write({...s,state:'running',attemptAt:now});return true;
 }).immediate();
}
export function finishLoginAttempt(state:Exclude<LoginState,'running'>){rawDb.transaction(()=>{const s=read();write({...s,state,checkedAt:Date.now()});}).immediate();return getLoginSettings();}

export function claimOtpAttempt():boolean {
 return rawDb.transaction(()=>{
  const s=read();
  if(!s.enabled||!['otp_required','otp_invalid'].includes(s.state))return false;
  write({...s,state:'running',attemptAt:Date.now()});return true;
 }).immediate();
}
