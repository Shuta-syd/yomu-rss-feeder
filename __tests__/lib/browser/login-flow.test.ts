import {beforeAll,beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import {createTestDb} from '../../helpers/test-db';
let testDb:ReturnType<typeof createTestDb>;
const evaluate=vi.hoisted(()=>vi.fn());
vi.mock('@/lib/db',()=>({get rawDb(){return testDb.raw}}));
vi.mock('@/lib/browser/cdp',()=>({browserTargets:async()=>[],openBrowserPage:async()=>({id:'login',webSocketDebuggerUrl:'ws://127.0.0.1:9222/test'}),evaluateBrowser:evaluate}));
import {saveLoginSettings,getLoginSettings} from '@/lib/browser/login-settings';
import {ensureNikkeiLogin} from '@/lib/browser/login';
import {LOGIN_STATE_EXPRESSION,SUBMIT_LOGIN_EXPRESSION} from '@/lib/browser/login-dom';
beforeAll(()=>{testDb=createTestDb();vi.stubEnv('ENCRYPTION_KEY','ab'.repeat(32))});
beforeEach(()=>{testDb.raw.exec('DELETE FROM app_config');evaluate.mockReset();saveLoginSettings({enabled:true,email:'reader@example.com',password:'secret-test'});vi.useFakeTimers()});
afterEach(()=>vi.useRealTimers());
function states(sequence:string[]){evaluate.mockImplementation(async(_ws:string,expression:string)=>expression===LOGIN_STATE_EXPRESSION?(sequence.shift()??'waiting'):true);}
async function run(){const result=ensureNikkeiLogin();await vi.runAllTimersAsync();return result;}
describe('automatic login flow',()=>{
 it('reuses a logged-in session without submitting credentials',async()=>{
  states(['logged_in']);expect((await run()).state).toBe('logged_in');expect(evaluate).toHaveBeenCalledTimes(1);
 });
 it('submits email and password once then verifies the logged-in page',async()=>{
  states(['login_required','email','password','logged_in']);expect((await run()).state).toBe('logged_in');
  expect(evaluate.mock.calls.filter(c=>c[1]===SUBMIT_LOGIN_EXPRESSION)).toHaveLength(2);
 });
 it('pauses on challenges and refuses background retries',async()=>{
  states(['login_required','email','manual_required']);expect((await run()).state).toBe('manual_required');
  const calls=evaluate.mock.calls.length;await ensureNikkeiLogin();expect(evaluate).toHaveBeenCalledTimes(calls);
 });
 it('limits attempts when a submitted password does not progress',async()=>{
  states(['login_required','email','password',...Array(70).fill('password')]);
  expect((await run()).state).toBe('manual_required');
  expect(evaluate.mock.calls.filter(c=>c[1]===SUBMIT_LOGIN_EXPRESSION)).toHaveLength(2);
  expect(JSON.stringify(getLoginSettings())).not.toContain('secret-test');
 });
});
