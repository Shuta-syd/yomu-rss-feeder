import {expect,it,vi} from 'vitest';
import {memoId,contentVersion,normalizeOrigin} from '../../src/lib/memos/content';
vi.mock('../../src/lib/url-safety',()=>({assertSafeHttpUrl:async(raw:string)=>new URL(raw)}));
import {MemosClient} from '../../src/lib/memos/client';
it('uses a stable valid memo ID isolated by account and instance',()=>{
 const id=memoId('article','https://memos.example','users/a');
 expect(id).toMatch(/^[a-z0-9-]{1,36}$/);
 expect(id).toBe(memoId('article','https://memos.example','users/a'));
 expect(id).not.toBe(memoId('article','https://memos.example','users/b'));
 expect(id).not.toBe(memoId('article','https://other.example','users/a'));
 expect(contentVersion('a')).not.toBe(contentVersion('b'));
});
it('requires an HTTPS root URL without credentials or parameters',()=>{
 expect(normalizeOrigin('https://memos.example/')).toBe('https://memos.example');
 for(const url of ['http://localhost','https://user:pass@memos.example','https://memos.example/path','https://memos.example/?token=abc'])expect(()=>normalizeOrigin(url)).toThrow();
});
it('sends private idempotent creates and does not follow redirects',async()=>{
 const request=vi.fn().mockResolvedValue(Response.json({name:'memos/yomu-test',content:'memo',creator:'users/a',visibility:'PRIVATE'}));
 const client=new MemosClient('https://memos.example','secret',request);
 await client.create('yomu-test','memo');
 expect(request).toHaveBeenCalledWith('https://memos.example/api/v1/memos?memoId=yomu-test',expect.objectContaining({method:'POST',redirect:'error',body:JSON.stringify({content:'memo',visibility:'PRIVATE',state:'NORMAL'})}));
});
it('rejects invalid upstream responses and never exposes upstream errors or token',async()=>{
 const client=new MemosClient('https://memos.example','secret',vi.fn().mockResolvedValue(new Response('secret upstream detail',{status:401})));
 await expect(client.me()).rejects.toThrow('トークン');
 const invalid=new MemosClient('https://memos.example','secret',vi.fn().mockResolvedValue(Response.json({})));
 await expect(invalid.memo('yomu-test')).rejects.toThrow();
});
it('updates only content, preserving visibility',async()=>{
 const request=vi.fn().mockResolvedValue(Response.json({name:'memos/yomu-test',content:'edit',creator:'users/a',visibility:'PRIVATE'}));
 await new MemosClient('https://memos.example','secret',request).update('yomu-test','edit');
 expect(request.mock.calls[0]?.[1]).toMatchObject({method:'PATCH',body:JSON.stringify({content:'edit'})});
 expect(request.mock.calls[0]?.[0]).toContain('updateMask=content');
});
import {composeMemoDraft} from '../../src/lib/memos/draft';
it('prepares only selected tags and optional existing summary, with safe source Markdown',()=>{
 const draft=composeMemoDraft({note:'自分の考え',title:'A [test]',url:'https://example.com/a(b)',tags:['業界:食品・農業'],summary:'要約'});
 expect(draft).toContain('自分の考え');expect(draft).toContain('#食品_農業');expect(draft).toContain('a%28b%29');expect(draft).toContain('記事の要約');
 expect(composeMemoDraft({note:'memo',title:'title',url:'javascript:alert(1)',tags:[]})).not.toContain('javascript:');
});
