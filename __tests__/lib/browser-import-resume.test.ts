import {it,expect,beforeEach} from 'vitest';
import {rememberBrowserImport,pendingBrowserImport,takeBrowserImport} from '@/lib/browser-import-resume';
const values=new Map<string,string>();
const storage={get length(){return values.size},clear:()=>values.clear(),key:(i:number)=>[...values.keys()][i]??null,getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>values.set(k,v),removeItem:(k:string)=>values.delete(k)} as Storage;
beforeEach(()=>values.clear());
it('consumes the pending article once even if the success effect reruns',()=>{rememberBrowserImport(storage,'article-1');expect(takeBrowserImport(storage)).toBe('article-1');expect(takeBrowserImport(storage)).toBeNull();});
it('does not resume old or future requests',()=>{rememberBrowserImport(storage,'article-1',100);expect(pendingBrowserImport(storage,100+30*60*1000)).toBeNull();expect(pendingBrowserImport(storage,99)).toBeNull();});
it('rejects malformed article identifiers',()=>{rememberBrowserImport(storage,'../../auth');expect(pendingBrowserImport(storage)).toBeNull();});
