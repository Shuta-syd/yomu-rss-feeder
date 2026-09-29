import {beforeAll,beforeEach,afterAll,it,expect,vi} from 'vitest';
import {createTestDb} from '../helpers/test-db';
let database:ReturnType<typeof createTestDb>;
const auth=vi.hoisted(()=>vi.fn());
vi.mock('@/lib/db',()=>({get db(){return database.db},get rawDb(){return database.raw}}));
vi.mock('@/lib/auth',()=>({requireAuth:auth}));
import {GET} from '@/app/api/ai/status/route';
import {POST} from '@/app/api/ai/retry/route';
import {updateSettings} from '@/lib/settings';
beforeAll(()=>{database=createTestDb();vi.stubEnv('ENCRYPTION_KEY','ab'.repeat(32))});
beforeEach(()=>{auth.mockReset();auth.mockResolvedValue(undefined);database.raw.exec("DELETE FROM articles;DELETE FROM feeds;DELETE FROM app_config;DELETE FROM ai_usage;INSERT INTO feeds(id,title,url,created_at) VALUES('f','Feed','https://example.com',1)");updateSettings({geminiApiKey:'fixture'});});
afterAll(()=>{database.close();vi.unstubAllEnvs()});
function add(id:string,status:string,error:string|null=null){database.raw.prepare('INSERT INTO articles(id,feed_id,title,url,dedup_hash,sort_key,created_at,ai_stage1_status,ai_stage1_error) VALUES(?,?,?,?,?,1,1,?,?)').run(id,'f',id,'https://example.com/'+id,id,status,error);}
it('reports historical failure causes without exposing provider bodies or URLs',async()=>{
 add('a','failed','LLM API error 429: Your prepayment credits are depleted. key=SECRET');
 add('b','failed','LLM JSON validation failed: tags missing SECRET');
 add('c','failed','LLM API error 503: SECRET');
 add('d','failed','fetch failed SECRET');
 add('e','done');
 const body=await(await GET()).json();expect(body.failed).toBe(4);
 expect(body.failureCounts).toEqual({billing:1,format:1,temporary:2,other:0});expect(JSON.stringify(body)).not.toContain('SECRET');
});
it('queues at most ten failed articles and leaves done, skipped and processing untouched',async()=>{
 for(let i=0;i<13;i++)add('f'+i,'failed','old error');add('done','done');add('skip','skipped');add('busy','processing');
 const result=await POST();
 expect(result.status).toBe(200);expect(await result.json()).toMatchObject({queued:10});
 const rows=database.raw.prepare('SELECT ai_stage1_status s,count(*) n FROM articles GROUP BY ai_stage1_status').all();
 expect(rows).toEqual([{s:'done',n:1},{s:'failed',n:3},{s:'pending',n:10},{s:'processing',n:1},{s:'skipped',n:1}]);
 expect(database.raw.prepare("SELECT count(*) n FROM articles WHERE ai_stage1_status='pending' AND ai_stage1_error IS NOT NULL").get()).toEqual({n:0});
 const second=await POST();expect(second.status).toBe(409);
});
it('requires authentication and an API key before queueing failed work',async()=>{
 add('a','failed');auth.mockRejectedValueOnce(new Response('Unauthorized',{status:401}));expect((await POST()).status).toBe(401);
 updateSettings({geminiApiKey:null});expect((await POST()).status).toBe(400);
 expect(database.raw.prepare('SELECT ai_stage1_status s FROM articles').get()).toEqual({s:'failed'});
});
