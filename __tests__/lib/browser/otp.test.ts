import {beforeAll,beforeEach,afterEach,it,expect,vi} from 'vitest';
import {createTestDb} from '../../helpers/test-db';
let testDb:ReturnType<typeof createTestDb>;
const mocks=vi.hoisted(()=>({evaluate:vi.fn(),insert:vi.fn(),targets:vi.fn()}));
vi.mock('@/lib/db',()=>({get rawDb(){return testDb.raw}}));
vi.mock('@/lib/browser/cdp',()=>({browserTargets:mocks.targets,evaluateBrowser:mocks.evaluate,insertBrowserText:mocks.insert}));
import {submitNikkeiOtp} from '@/lib/browser/otp';
import {saveLoginSettings,finishLoginAttempt,claimLoginAttempt} from '@/lib/browser/login-settings';
import {LOGIN_STATE_EXPRESSION} from '@/lib/browser/login-dom';
beforeAll(()=>{testDb=createTestDb();vi.stubEnv('ENCRYPTION_KEY','ab'.repeat(32));});
beforeEach(()=>{testDb.raw.exec('DELETE FROM app_config');vi.clearAllMocks();saveLoginSettings({enabled:true,email:'test@example.com',password:'test'});finishLoginAttempt('otp_required');testDb.raw.prepare("INSERT INTO app_config VALUES('nikkei_login_tab','login')").run();mocks.targets.mockResolvedValue([{id:'login',type:'page',url:'https://id.nikkei.com/login/challenge',webSocketDebuggerUrl:'ws://localhost:9222/devtools/page/login'}]);mocks.insert.mockResolvedValue(undefined);vi.useFakeTimers();});
afterEach(()=>vi.useRealTimers());
function states(list:string[]){mocks.evaluate.mockImplementation(async(_ws:string,expr:string)=>expr===LOGIN_STATE_EXPRESSION?(list.shift()??'waiting'):true);}
async function run(code='123456'){const p=submitNikkeiOtp(code);await vi.runAllTimersAsync();return p;}
it('enters a code once and verifies login without storing the code',async()=>{states(['otp_required','logged_in']);expect((await run()).state).toBe('logged_in');expect(mocks.insert.mock.calls.map(c=>c[1]).join('')).toBe('123456');expect(JSON.stringify(testDb.raw.prepare('SELECT * FROM app_config').all())).not.toContain('123456');});
it('stops on invalid codes and never retries in the background',async()=>{states(['otp_required','otp_invalid']);expect((await run()).state).toBe('otp_invalid');expect(mocks.insert).toHaveBeenCalledTimes(6);expect(claimLoginAttempt()).toBe(false);});
it('does not type into an expired challenge',async()=>{states(['otp_expired']);expect((await run()).state).toBe('otp_expired');expect(mocks.insert).not.toHaveBeenCalled();});
it('rejects invalid input before touching the browser',async()=>{await expect(submitNikkeiOtp('12x')).rejects.toThrow();expect(mocks.targets).not.toHaveBeenCalled();});
it('does not type into another origin or another tab',async()=>{mocks.targets.mockResolvedValue([{id:'login',type:'page',url:'https://evil.example/login/challenge',webSocketDebuggerUrl:'ws://localhost:9222/devtools/page/login'}]);expect((await run()).state).toBe('manual_required');expect(mocks.insert).not.toHaveBeenCalled();});
it('locks simultaneous submissions',async()=>{states(['otp_required','logged_in']);const first=submitNikkeiOtp('123456');await expect(submitNikkeiOtp('654321')).rejects.toThrow();await vi.runAllTimersAsync();await first;expect(mocks.insert).toHaveBeenCalledTimes(6);});
