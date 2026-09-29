import {describe,it,expect} from 'vitest';
import {JSDOM} from 'jsdom';
import {LOGIN_STATE_EXPRESSION,fillLoginExpression} from '@/lib/browser/login-dom';
function page(html:string,url='https://id.nikkei.com/login/id'){
 const d=new JSDOM(html,{url,runScripts:'outside-only'});
 Object.defineProperty(d.window.HTMLElement.prototype,'innerText',{get(){return this.textContent}});
 d.window.Element.prototype.getClientRects=()=>({length:1}) as DOMRectList;
 d.window.Element.prototype.getBoundingClientRect=function(){const el=this as HTMLElement;return {width:el.style.width==='0px'?0:400,height:el.style.height==='0px'?0:40} as DOMRect;};
 return d;
}
describe('Nikkei login DOM controls',()=>{
 it('waits for a newly created blank tab to navigate before classifying authentication',()=>{
  const d=page('', 'about:blank');
  expect(d.window.eval(LOGIN_STATE_EXPRESSION)).toBe('waiting');d.window.close();
 });
 it('recognizes the email step despite the zero-size autofill password wrapper',()=>{
  const d=page('<form><input type="email"><div style="width:0;height:0;overflow:hidden"><input type="password"></div><button type="submit">次に進む</button></form>');
  expect(d.window.eval(LOGIN_STATE_EXPRESSION)).toBe('email');d.window.close();
 });
 it('stops at an additional verification step and never fills a foreign site',()=>{
  const challenge=page('<p>認証コードを入力してください</p><input type="password">');
  expect(challenge.window.eval(LOGIN_STATE_EXPRESSION)).toBe('manual_required');challenge.window.close();
  const d=page('<form><input type="password"><button type="submit">Login</button></form>','https://evil.example/login');
  expect(d.window.eval(fillLoginExpression('password','secret-test'))).toBe(false);
  expect(d.window.document.querySelector('input')!.value).toBe('');d.window.close();
 });
 it('fills only a visible official field and refuses a form posting to another origin',()=>{
  const d=page('<form><input type="email"><button type="submit" disabled>Next</button></form>');
  expect(d.window.eval(fillLoginExpression('email','reader@example.com'))).toBe(true);
  expect(d.window.document.querySelector('input')!.value).toBe('reader@example.com');d.window.close();
  const bad=page('<form action="https://evil.example"><input type="password"><button type="submit">Login</button></form>');
  expect(bad.window.eval(fillLoginExpression('password','secret-test'))).toBe(false);bad.window.close();
 });
});

it('distinguishes the official six-digit challenge, invalid codes, expiry and CAPTCHA',()=>{
 const inputs='<input type="text">'.repeat(6);
 for(const [message,expected] of [['確認コードを入力','otp_required'],['コードが正しくありません','otp_invalid'],['有効期限が切れました','otp_expired']]){
  const d=page(`<p>${message}</p>${inputs}`,'https://id.nikkei.com/login/challenge');expect(d.window.eval(LOGIN_STATE_EXPRESSION)).toBe(expected);d.window.close();
 }
 const d=page(`${inputs}<iframe src="https://example.com/captcha"></iframe>`,'https://id.nikkei.com/login/challenge');expect(d.window.eval(LOGIN_STATE_EXPRESSION)).toBe('manual_required');d.window.close();
});
