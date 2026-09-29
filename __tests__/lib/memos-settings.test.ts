import {beforeAll,beforeEach,afterAll,expect,it,vi} from 'vitest';
import {createTestDb} from '../helpers/test-db';
let db:ReturnType<typeof createTestDb>;
const me=vi.hoisted(()=>vi.fn().mockResolvedValue({name:'users/a',displayName:'reader'}));
vi.mock('@/lib/db',()=>({get rawDb(){return db.raw}}));
vi.mock('@/lib/memos/client',async(importOriginal)=>{const original=await importOriginal<typeof import('@/lib/memos/client')>();return {...original,MemosClient:class{me=me}};});
import {saveMemosConfig,publicMemosConfig,disconnectMemos} from '@/lib/memos/settings';
beforeAll(()=>{db=createTestDb();vi.stubEnv('ENCRYPTION_KEY','ab'.repeat(32));});beforeEach(()=>{db.raw.exec('DELETE FROM app_config');me.mockClear();});afterAll(()=>{db.close();vi.unstubAllEnvs();});
it('encrypts tokens, never returns them and requires a fresh token for a new origin',async()=>{
 await saveMemosConfig('https://memos.example','private-token');
 expect(JSON.stringify(publicMemosConfig())).not.toContain('private-token');
 expect(JSON.stringify(db.raw.prepare('SELECT * FROM app_config').all())).not.toContain('private-token');
 await saveMemosConfig('https://memos.example');
 await expect(saveMemosConfig('https://different.example')).rejects.toThrow('トークン');
 expect(me).toHaveBeenCalledTimes(2);
 disconnectMemos();expect(publicMemosConfig().configured).toBe(false);
});
it('keeps prior settings when connection checking fails',async()=>{
 await saveMemosConfig('https://memos.example','private-token');
 me.mockRejectedValueOnce(new Error('offline'));
 await expect(saveMemosConfig('https://other.example','new-token')).rejects.toThrow();
 expect(publicMemosConfig().origin).toBe('https://memos.example');
});
