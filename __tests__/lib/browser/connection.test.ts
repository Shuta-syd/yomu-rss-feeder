import {beforeEach,describe,it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({targets:vi.fn(),evaluate:vi.fn(),open:vi.fn(),close:vi.fn(),login:vi.fn()}));
vi.mock('@/lib/browser/cdp',()=>({browserTargets:mocks.targets,evaluateBrowser:mocks.evaluate,openBrowserPage:mocks.open,closeBrowserPage:mocks.close,browserStatus:vi.fn()}));
vi.mock('@/lib/browser/login',()=>({ensureNikkeiLogin:mocks.login}));
import {captureBrowserArticle} from '@/lib/browser/connection';
const url='https://www.nikkei.com/article/ABC123/';
const capture={url,blocked:false,html:'<p>'+('購読した記事の本文です。'.repeat(15))+'</p>'};
beforeEach(()=>{vi.clearAllMocks();mocks.targets.mockResolvedValue([]);mocks.open.mockResolvedValue({id:'temporary',url,webSocketDebuggerUrl:'ws://localhost:9222/devtools/page/temporary'});mocks.close.mockResolvedValue(undefined);mocks.login.mockResolvedValue({state:'logged_in'});mocks.evaluate.mockResolvedValue(capture)});
describe('server article capture',()=>{
 it('opens an article on demand and closes only its temporary tab',async()=>{const result=await captureBrowserArticle(url);expect(result.contentPlain).toContain('購読した記事');expect(mocks.login).toHaveBeenCalled();expect(mocks.open).toHaveBeenCalledWith(url);expect(mocks.close).toHaveBeenCalledWith('temporary')});
 it('preserves an existing user tab',async()=>{mocks.targets.mockResolvedValue([{id:'user',type:'page',url,webSocketDebuggerUrl:'ws://localhost:9222/devtools/page/user'}]);await captureBrowserArticle(url);expect(mocks.open).not.toHaveBeenCalled();expect(mocks.close).not.toHaveBeenCalled()});
 it('rejects non-Nikkei URLs before opening any browser',async()=>{await expect(captureBrowserArticle('https://example.com/')).rejects.toThrow();expect(mocks.targets).not.toHaveBeenCalled()});
 it('keeps the paywall closed and cleans up when login needs manual action',async()=>{mocks.evaluate.mockResolvedValue({url,blocked:true});mocks.login.mockResolvedValue({state:'manual_required'});await expect(captureBrowserArticle(url)).rejects.toThrow('ログイン');expect(mocks.close).toHaveBeenCalledWith('temporary')});
 it('rejects unrelated captured content and cleans up',async()=>{mocks.evaluate.mockResolvedValue({...capture,html:'short'});await expect(captureBrowserArticle(url)).rejects.toThrow();expect(mocks.close).toHaveBeenCalledWith('temporary')});
});
