import {describe,it,expect} from 'vitest';
import {validateBrowserCapture,matchingArticleUrl} from '@/lib/browser/article-import';
const url='https://www.nikkei.com/article/DGXZQOUC109GT0Q6A910C2000000/';
const html='<p>'+ '購読後に表示された記事本文。'.repeat(20)+'</p>';
describe('browser article import',()=>{
 it('matches the article identity without tracking parameters',()=>{
  expect(matchingArticleUrl(url+'?n_cid=test',url)).toBe(true);
  expect(matchingArticleUrl(url.replace('2000000','2000001'),url)).toBe(false);
  expect(matchingArticleUrl('https://evil.example/article/x',url)).toBe(false);
 });
 it('sanitizes visible captured content without fetching anything',()=>{
  const result=validateBrowserCapture({url,html:html+'<script>secret()</script><img src="https://example.com/a.jpg" onerror="evil()">',blocked:false},url);
  expect(result.contentPlain).toContain('記事本文');
  expect(result.contentHtml).not.toContain('script');
  expect(result.contentHtml).not.toContain('onerror');
 });
 it('rejects mismatched, gated or incomplete content',()=>{
  expect(()=>validateBrowserCapture({url:url+'other',html,blocked:false},url)).toThrow();
  expect(()=>validateBrowserCapture({url,html,blocked:true},url)).toThrow(/ログイン|本文/);
  expect(()=>validateBrowserCapture({url,html:'<p>続きはログイン</p>',blocked:false},url)).toThrow();
 });
});

import {JSDOM} from 'jsdom';
import {CAPTURE_EXPRESSION} from '@/lib/browser/article-import';
function captureDocument(body:string){
 const dom=new JSDOM(body,{url,runScripts:'outside-only'});
 Object.defineProperty(dom.window.HTMLElement.prototype,'innerText',{get(){return this.textContent}});
 dom.window.Element.prototype.getClientRects=()=>({length:1}) as DOMRectList;
 const result=dom.window.eval(CAPTURE_EXPRESSION) as {blocked:boolean;html?:string};dom.window.close();return result;
}
describe('visible browser content',()=>{
 it('excludes hidden content, scripts, controls and unrelated article chrome',()=>{
  const r=captureDocument('<article><h1>Title</h1><section data-track-article-content>'+html+'<p hidden>hidden entitlement text</p><p style="display:none">hidden2</p><script>sessionSecret</script><button>share</button></section><aside>related</aside></article>');
  expect(r.blocked).toBe(false);expect(r.html).toContain('記事本文');
  for(const text of ['hidden entitlement','hidden2','sessionSecret','share','related'])expect(r.html).not.toContain(text);
 });
 it('does not capture the body while a visible login gate is present',()=>{
  const r=captureDocument('<article><section data-track-article-content>'+html+'</section><div class="paywall_test">ログインする</div></article>');
  expect(r.blocked).toBe(true);expect(r.html).toBeUndefined();
 });
});
