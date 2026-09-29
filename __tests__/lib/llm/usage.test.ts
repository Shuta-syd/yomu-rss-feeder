import {beforeAll,beforeEach,describe,it,expect,vi} from 'vitest';
import {createTestDb} from '../../helpers/test-db';
let testDb:ReturnType<typeof createTestDb>;
vi.mock('@/lib/db',()=>({get rawDb(){return testDb.raw}}));
import {reserveUsage,finishUsage,getUsageReport,saveBudget,LLMBudgetError,meteredProvider} from '@/lib/llm/usage';
beforeAll(()=>{testDb=createTestDb()});
beforeEach(()=>{testDb.raw.exec('DELETE FROM ai_usage; DELETE FROM app_config;')});
const params={systemPrompt:'classify',userPrompt:'news',maxOutputTokens:100};
describe('AI usage budget',()=>{
 it('reserves before calling and blocks concurrent requests against the same cap',()=>{
  saveBudget({dailyYen:1,monthlyYen:1,yenPerUsd:150});
  reserveUsage('gemini','gemini-3-flash-preview',params);
  expect(()=>reserveUsage('gemini','gemini-3-flash-preview',params)).toThrow(LLMBudgetError);
 });
 it('settles known tokens and retains conservative cost when usage is unavailable',()=>{
  const id=reserveUsage('gemini','gemini-3-flash-preview',params);
  finishUsage(id,{inputTokens:1000,outputTokens:100,known:true},'success');
  expect(getUsageReport().todayYen).toBeCloseTo(.12);
  const failed=reserveUsage('gemini','gemini-3-flash-preview',params);
  const before=getUsageReport().todayYen;finishUsage(failed,null,'failed');
  expect(getUsageReport().todayYen).toBe(before);
 });
 it('does not permit unpriced models or zero budgets to make calls',()=>{
  expect(()=>reserveUsage('gemini','unknown',params)).toThrow();
  saveBudget({dailyYen:0,monthlyYen:0,yenPerUsd:150});
  expect(()=>reserveUsage('gemini','gemini-3-flash-preview',params)).toThrow(LLMBudgetError);
 });
});

describe('metered provider',()=>{
 it('does not invoke the API after budget exhaustion',async()=>{
  const chat=vi.fn();const inner={name:'gemini',chat,async *chatStream(){yield 'unused'}};
  saveBudget({dailyYen:0,monthlyYen:0,yenPerUsd:150});
  await expect(meteredProvider(inner,'gemini-3-flash-preview').chat(params)).rejects.toThrow(LLMBudgetError);
  expect(chat).not.toHaveBeenCalled();expect(getUsageReport().recent).toHaveLength(0);
 });
 it('records streaming usage on completion, retains reservation on interruption',async()=>{
  const inner={name:'gemini',chat:vi.fn(),async *chatStream(p:import('@/lib/llm/provider').ChatParams){
   p.onUsage?.({inputTokens:1000,outputTokens:100,known:true});yield 'part';yield 'end';
  }};
  const provider=meteredProvider(inner,'gemini-3-flash-preview');
  for await(const chunk of provider.chatStream(params)){expect(chunk).toBeTruthy()}
  expect(getUsageReport().todayYen).toBeCloseTo(.12);
  for await(const chunk of provider.chatStream(params)){expect(chunk).toBe('part');break}
  const rows=testDb.raw.prepare('SELECT status,cost_yen,reserved_yen FROM ai_usage').all() as {status:string;cost_yen:number;reserved_yen:number}[];
  const interrupted=rows.find(r=>r.status==='interrupted_estimated')!;
  expect(interrupted.cost_yen).toBe(interrupted.reserved_yen);
 });
 it('counts monthly spend across days while resetting the daily period',()=>{
  const id=reserveUsage('gemini','gemini-3-flash-preview',params);
  finishUsage(id,{inputTokens:100000,outputTokens:0,known:true},'success');
  const today=new Date(Date.now()+9*3600000).toISOString().slice(0,10);
  testDb.raw.prepare('UPDATE ai_usage SET created_at=?').run(Date.parse(today+'T00:00:00+09:00')-1);
  expect(getUsageReport().todayYen).toBe(0);
  // At a month boundary the previous day's usage correctly belongs to last month.
  if(!today.endsWith('-01')) expect(getUsageReport().monthYen).toBeCloseTo(7.5);
 });
});
