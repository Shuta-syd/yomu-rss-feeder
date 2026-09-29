import {beforeAll,beforeEach,afterAll,it,expect,vi} from 'vitest';
import {NextRequest} from 'next/server';
import {createTestDb} from '../helpers/test-db';
let database:ReturnType<typeof createTestDb>;
const auth=vi.hoisted(()=>vi.fn());
vi.mock('@/lib/auth',()=>({requireAuth:auth}));
vi.mock('@/lib/db',()=>({get rawDb(){return database.raw},get db(){return database.db}}));
import {GET} from '@/app/api/articles/route';
import {PUT} from '@/app/api/settings/route';
import {updateSettings,getSettings} from '@/lib/settings';
beforeAll(()=>{database=createTestDb();vi.stubEnv('ENCRYPTION_KEY','ab'.repeat(32));});
beforeEach(()=>{auth.mockReset();auth.mockResolvedValue(undefined);database.raw.exec('DELETE FROM app_config; DELETE FROM articles; DELETE FROM feeds;');});
afterAll(()=>{database.close();vi.unstubAllGlobals();vi.unstubAllEnvs();});
it('requires authentication before searching or saving a key',async()=>{
 auth.mockRejectedValue(new Response('Unauthorized',{status:401}));
 expect((await GET(new NextRequest('http://localhost/api/articles?search=test'))).status).toBe(401);
 expect((await PUT(new NextRequest('http://localhost/api/settings',{method:'PUT',body:JSON.stringify({jevApiKey:'secret'})}))).status).toBe(401);
 expect(getSettings().hasJevApiKey).toBe(false);
});
it.each(['NaN','-1','0','101','1.5'])('rejects invalid pagination limit %s',async limit=>{
 expect((await GET(new NextRequest('http://localhost/api/articles?limit='+limit))).status).toBe(400);
});
it('OFF and explicit keyword fallback make no remote calls',async()=>{
 const fetcher=vi.fn(()=>{throw new Error('Unexpected remote call')});vi.stubGlobal('fetch',fetcher);
 expect((await GET(new NextRequest('http://localhost/api/articles?search=test'))).status).toBe(200);
 updateSettings({jevApiKey:'test-key',jevSearchEnabled:true});
 expect((await GET(new NextRequest('http://localhost/api/articles?search=test&searchMode=keyword'))).status).toBe(200);
 expect(fetcher).not.toHaveBeenCalled();
});
it('rejects Jev cursors after switching to keyword mode',async()=>{
 expect((await GET(new NextRequest('http://localhost/api/articles?search=test&cursor=jev:any:1'))).status).toBe(409);
});
it('reports missing expansion credentials safely without returning candidates',async()=>{
 updateSettings({jevApiKey:'test-secret',jevSearchEnabled:true});
 const response=await GET(new NextRequest('http://localhost/api/articles?search=test'));
 expect(response.status).toBe(503);const body=await response.json();expect(body.error).toContain('Jev');expect(body.articles).toBeUndefined();expect(JSON.stringify(body)).not.toContain('test-secret');
});
