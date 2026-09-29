import {describe,it,expect} from 'vitest';
import {JSDOM} from 'jsdom';
import {cleanArticleDocument} from '@/lib/article-readability';
const url='https://www.nikkei.com/article/test/';
function clean(html:string,source=url){const d=new JSDOM(html);cleanArticleDocument(d.window.document,source);return d.window.document.body.innerHTML;}
describe('article display cleanup',()=>{
 it('keeps paragraphs and images, removes the Nikkei subscription and related tail',()=>{
  const body='<p>本文です。</p><figure><img src="https://example.com/a.jpg"><figcaption>写真</figcaption></figure>';
  expect(clean(body+'<div><p>すべての記事が読み放題有料会員が初回1カ月無料</p><p>こちらもおすすめ（自動検索）</p><p>別の記事</p></div>')).toBe(body+'<div></div>');
 });
 it('preserves quoted phrases and other publishers',()=>{
  const body='<blockquote><p>こちらもおすすめ（自動検索）</p></blockquote><p>この表現について解説します。</p>';
  expect(clean(body)).toBe(body);
  expect(clean('<p>こちらもおすすめ（自動検索）</p><p>本文</p>','https://example.com/')).toContain('本文');
 });
 it('removes navigation and forms without deleting prose',()=>{
  expect(clean('<nav>メニュー</nav><p>本文</p><form>登録</form>')).toBe('<p>本文</p>');
 });
});
