import {beforeAll,beforeEach,describe,it,expect,vi} from 'vitest';
import {createTestDb} from '../../helpers/test-db';
let testDb:ReturnType<typeof createTestDb>;
vi.mock('@/lib/db',()=>({get rawDb(){return testDb.raw}}));
import {saveLoginSettings,getLoginSettings,getLoginCredentials,clearLoginCredentials,claimLoginAttempt,finishLoginAttempt} from '@/lib/browser/login-settings';
beforeAll(()=>{testDb=createTestDb();vi.stubEnv('ENCRYPTION_KEY','ab'.repeat(32))});
beforeEach(()=>testDb.raw.exec('DELETE FROM app_config'));
describe('Nikkei login storage and retry control',()=>{
 it('recovers a crashed attempt without getting stuck in the running UI state',()=>{
  saveLoginSettings({enabled:true,email:'reader@example.com',password:'private-password'});
  expect(claimLoginAttempt()).toBe(true);
  const row=testDb.raw.prepare("SELECT value FROM app_config WHERE key='nikkei_auto_login'").get() as {value:string};
  const saved=JSON.parse(row.value);saved.attemptAt=Date.now()-121000;
  testDb.raw.prepare("UPDATE app_config SET value=? WHERE key='nikkei_auto_login'").run(JSON.stringify(saved));
  expect(getLoginSettings().state).toBe('manual_required');
  expect(claimLoginAttempt()).toBe(false);
  expect(claimLoginAttempt(true)).toBe(true);
 });
 it('stores encrypted credentials and returns only presence flags to the UI',()=>{
  saveLoginSettings({enabled:true,email:'reader@example.com',password:'private-password'});
  const stored=JSON.stringify(testDb.raw.prepare('SELECT * FROM app_config').all());
  expect(stored).not.toContain('reader@example.com');expect(stored).not.toContain('private-password');
  expect(getLoginSettings()).toMatchObject({enabled:true,hasCredentials:true});
  expect(JSON.stringify(getLoginSettings())).not.toContain('reader@example.com');
  expect(getLoginCredentials()).toEqual({email:'reader@example.com',password:'private-password'});
 });
 it('preserves saved credentials for toggle-only updates, and deletes them on disconnect',()=>{
  saveLoginSettings({enabled:true,email:'reader@example.com',password:'private-password'});
  saveLoginSettings({enabled:false});expect(getLoginCredentials()?.password).toBe('private-password');
  clearLoginCredentials();expect(getLoginCredentials()).toBeNull();expect(getLoginSettings().enabled).toBe(false);
 });
 it('prevents concurrent attempts and does not automatically retry failed passwords or challenges',()=>{
  saveLoginSettings({enabled:true,email:'reader@example.com',password:'private-password'});
  expect(claimLoginAttempt()).toBe(true);expect(claimLoginAttempt()).toBe(false);
  finishLoginAttempt('manual_required');expect(claimLoginAttempt()).toBe(false);
  expect(claimLoginAttempt(true)).toBe(true);
  finishLoginAttempt('failed');expect(claimLoginAttempt()).toBe(false);
 });
});
