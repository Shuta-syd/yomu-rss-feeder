import { beforeAll, beforeEach, afterAll, expect, it, vi } from 'vitest';
import { createTestDb } from '../helpers/test-db';
let database: ReturnType<typeof createTestDb>;
vi.mock('@/lib/db', () => ({get rawDb(){return database.raw},get db(){return database.db}}));
import { getSettings, updateSettings, getDecryptedKey } from '@/lib/settings';
import { listArticles } from '@/lib/articles-query';
beforeAll(()=>{ database=createTestDb(); vi.stubEnv('ENCRYPTION_KEY','ab'.repeat(32)); });
beforeEach(()=>{database.raw.exec('DELETE FROM articles; DELETE FROM feeds; DELETE FROM app_config; DELETE FROM ai_usage;');});
afterAll(()=>{database.close();vi.unstubAllEnvs();});
function article(id:string,title:string,time:number,feed='f',read=0){
 database.raw.prepare("INSERT OR IGNORE INTO feeds(id,title,url,created_at) VALUES(?,?,?,1)").run(feed,feed,'https://example.com/'+feed);
 database.raw.prepare("INSERT INTO articles(id,feed_id,title,url,dedup_hash,sort_key,created_at,is_read) VALUES(?,?,?,?,?,?,1,?)").run(id,feed,title,'https://example.com/'+id,id,time,read);
}
it('saves the search toggle, encrypts its key and disables search when the key is removed',()=>{
 expect(getSettings()).toMatchObject({jevSearchEnabled:false,hasJevApiKey:false});
 updateSettings({jevApiKey:'test-private-key',jevSearchEnabled:true});
 expect(getSettings()).toMatchObject({jevSearchEnabled:true,hasJevApiKey:true});
 expect(JSON.stringify(database.raw.prepare('SELECT * FROM app_config').all())).not.toContain('test-private-key');
 expect(JSON.stringify(getSettings())).not.toContain('test-private-key');
 expect(getDecryptedKey('jev_api_key')).toBe('test-private-key');
 updateSettings({jevApiKey:null});
 expect(getSettings()).toMatchObject({jevSearchEnabled:false,hasJevApiKey:false});
});
it('rejects enablement without a key without changing other settings',()=>{
 expect(()=>updateSettings({jevSearchEnabled:true,theme:'dark'})).toThrow();
 expect(getSettings().theme).toBe('system');
});
it('finds Japanese paraphrases before pagination and preserves all existing filters',()=>{
 article('old','候補者の見極め方',1);article('new','採用面談で聞く質問',10);article('noise','新工場の採用計画',100);
 article('read','採用面談',200,'f',1);article('other','採用面談',300,'other');
 const result=listArticles({searchTerms:['採用面談','候補者'],isRead:false,feedId:'f',limit:1});
 expect(result.articles.map(a=>a.id)).toEqual(['new']);expect(result.total).toBe(2);
});
it('keeps Jev order instead of date order and handles an empty ranking',()=>{
 article('old','面接',1);article('new','面接',10);
 expect(listArticles({rankedIds:['old','new']}).articles.map(a=>a.id)).toEqual(['old','new']);
 expect(listArticles({rankedIds:[]}).articles).toEqual([]);
});
it('treats generated SQL/FTS operators and wildcard characters as literal text',()=>{
 article('a','面接',1);
 expect(listArticles({searchTerms:['%','_','" OR 1=1 --']}).total).toBe(0);
});
