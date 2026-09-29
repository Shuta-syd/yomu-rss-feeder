import {describe,it,expect,vi} from 'vitest';
import {createServer} from 'node:http';
import {normalizeTarget,requestBrowser,evaluateBrowser} from '@/lib/browser/cdp';
const target={id:'a',type:'page',url:'https://www.nikkei.com/',webSocketDebuggerUrl:'ws://localhost:9222/devtools/page/a'};
describe('private browser relay',()=>{
 it('maps only the known Chrome loopback endpoint to the private service',()=>{expect(normalizeTarget(target,new URL('http://yomu-browser:9223')).webSocketDebuggerUrl).toBe('ws://yomu-browser:9223/devtools/page/a')});
 it('does not change a local browser endpoint',()=>{expect(normalizeTarget(target,new URL('http://localhost:9222'))).toEqual(target)});
 it('rejects unexpected websocket hosts or paths from the relay',()=>{for(const ws of ['ws://evil.example/devtools/page/a','ws://localhost:9222/elsewhere','wss://localhost:9222/devtools/page/a'])expect(()=>normalizeTarget({...target,webSocketDebuggerUrl:ws},new URL('http://yomu-browser:9223'))).toThrow()});
});

it('preserves the Chrome Host header on the actual HTTP request',async()=>{
 const server=createServer((req,res)=>res.end(JSON.stringify({host:req.headers.host,method:req.method})));
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 try {
  const address=server.address() as {port:number};
  const response=await requestBrowser(new URL(`http://127.0.0.1:${address.port}/json/new`),'PUT',{Host:'localhost:9222'});
  expect(JSON.parse(response)).toEqual({host:'localhost:9222',method:'PUT'});
 } finally {await new Promise<void>(resolve=>server.close(()=>resolve()));}
});

it('rejects a websocket outside the configured browser before connecting',async()=>{
 vi.stubEnv('YOMU_BROWSER_CDP_URL','http://yomu-browser:9223');
 try {
  await expect(evaluateBrowser('ws://evil.example:9223/devtools/page/a','1+1')).rejects.toThrow('接続先');
  await expect(evaluateBrowser('wss://yomu-browser:9223/devtools/page/a','1+1')).rejects.toThrow('接続先');
 } finally {vi.unstubAllEnvs();}
});
