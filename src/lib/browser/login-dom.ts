export type LoginPageState='logged_in'|'login_required'|'email'|'password'|'waiting'|'manual_required'|'otp_required'|'otp_invalid'|'otp_expired'|'failed';
const visibility = `const visible=e=>{
 if(!e||!e.getClientRects().length)return false;
 for(let n=e;n;n=n.parentElement){
  const s=getComputedStyle(n),r=n.getBoundingClientRect();
  if(n.hidden||n.getAttribute('aria-hidden')==='true'||s.display==='none'||s.visibility==='hidden'||s.opacity==='0')return false;
  if(['hidden','clip'].includes(s.overflow)&&(r.width===0||r.height===0))return false;
 }
 return true;
};`;
// Only states and field presence leave the page; never field values or page text.
export const LOGIN_STATE_EXPRESSION=`(() => {
 ${visibility}
 if(location.href==='about:blank')return 'waiting';
 if(location.origin==='https://www.nikkei.com') {
   if(document.querySelector('a[href="https://www.nikkei.com/logout"],a[href="/logout"]'))return 'logged_in';
   if([...document.querySelectorAll('a')].some(a=>visible(a)&&a.href==='https://www.nikkei.com/login'))return 'login_required';
   return 'waiting';
 }
 if(location.origin!=='https://id.nikkei.com'||!location.pathname.startsWith('/login'))return 'manual_required';
 const text=document.body.innerText;
 if(location.pathname==='/login/challenge') {
  if([...document.querySelectorAll('iframe')].some(e=>visible(e)&&/captcha|challenge/.test(e.src)))return 'manual_required';
  if(/有効期限が切れ|期限切れ|有効期限を過ぎ/.test(text))return 'otp_expired';
  const fields=[...document.querySelectorAll('input[type="text"]')].filter(visible);
  if(fields.length===6) {
   if(/正しくありません|一致しません|コードが違|コードに誤り|認証に失敗/.test(text))return 'otp_invalid';
   return 'otp_required';
  }
  return 'manual_required';
 }

 if([...document.querySelectorAll('iframe')].some(e=>visible(e)&&/captcha|challenge/.test(e.src))||/認証コード|確認コード|ワンタイム|セキュリティキー|ロボットでは|パスキーを使用/.test(text))return 'manual_required';
 if(/パスワードが正しく|パスワードが違|一致しません|ログインできません|アカウントがロック|入力内容に誤り|登録されていません/.test(text))return 'failed';
 if([...document.querySelectorAll('input[type="password"]')].some(visible))return 'password';
 if([...document.querySelectorAll('input[type="email"],input[name="email"]')].some(visible))return 'email';
 return 'waiting';
})()`;
export function fillLoginExpression(kind:'email'|'password',value:string):string{
 return `(() => {
  ${visibility}
  if(location.origin!=='https://id.nikkei.com'||!location.pathname.startsWith('/login'))return false;
  const field=[...document.querySelectorAll(${JSON.stringify(kind==='email'?'input[type="email"],input[name="email"]':'input[type="password"]')})].find(visible);
  const form=field?.form;
  if(!field||!form||new URL(form.action).origin!==location.origin)return false;
  const button=[...form.querySelectorAll('button[type="submit"],input[type="submit"]')].find(visible);
  if(!button)return false;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(field,${JSON.stringify(value)});
  field.dispatchEvent(new Event('input',{bubbles:true}));field.dispatchEvent(new Event('change',{bubbles:true}));
  return true;
 })()`;
}
export const SUBMIT_LOGIN_EXPRESSION=`(() => {
 ${visibility}
 if(location.origin!=='https://id.nikkei.com'||!location.pathname.startsWith('/login'))return false;
 const forms=[...document.forms].filter(f=>new URL(f.action).origin===location.origin);
 const button=forms.flatMap(f=>[...f.querySelectorAll('button[type="submit"],input[type="submit"]')]).find(e=>!e.disabled&&visible(e));
 if(!button)return false;button.click();return true;
})()`;

export function otpFocusExpression(index:number):string {
 if(!Number.isInteger(index)||index<0||index>5)throw new Error('Invalid field');
 return `(() => {
  ${visibility}
  if(location.origin!=='https://id.nikkei.com'||location.pathname!=='/login/challenge')return false;
  const fields=[...document.querySelectorAll('input[type="text"]')].filter(visible);
  if(fields.length!==6)return false;
  const field=fields[${index}];field.focus();field.select();return true;
 })()`;
}
