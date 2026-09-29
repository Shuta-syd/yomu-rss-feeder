import { randomUUID } from 'node:crypto';
import { rawDb } from '../db';
import type { ChatParams, LLMProvider } from './provider';

export type Usage = {inputTokens:number;outputTokens:number;known:boolean};
type Rates = Record<string,{input:number;output:number}>;
export type Budget = {dailyYen:number;monthlyYen:number;yenPerUsd:number;rates?:Rates};
// Text-only standard rates; review against https://ai.google.dev/gemini-api/docs/pricing
const DEFAULT_RATES:Rates={
 'jev-1.13.0':{input:.042,output:0}, // https://docs.typesafe.ai/models (2026-09-29)
 'gemini-3.1-flash-lite':{input:.25,output:1.5},
 'gemini-3.5-flash-lite':{input:.3,output:2.5},
 'gemini-3-flash-preview':{input:.5,output:3},
 'gemini-2.5-flash':{input:.3,output:2.5},
 'gemini-2.5-flash-lite':{input:.1,output:.4},
};
export class LLMBudgetError extends Error {}
export function getBudget():Required<Budget>{
 const row=rawDb.prepare("SELECT value FROM app_config WHERE key='ai_budget'").get() as {value:string}|undefined;
 const value=row?JSON.parse(row.value):{};
 return {dailyYen:value.dailyYen??300,monthlyYen:value.monthlyYen??3000,yenPerUsd:value.yenPerUsd??150,rates:{...DEFAULT_RATES,...value.rates}};
}
export function saveBudget(value:Budget){
 const next={...getBudget(),...value};
 rawDb.prepare("INSERT INTO app_config(key,value) VALUES('ai_budget',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify(next));
 return next;
}
function starts(now=Date.now()){
 const iso=new Date(now+9*3600000).toISOString();
 return {day:Date.parse(iso.slice(0,10)+'T00:00:00+09:00'),month:Date.parse(iso.slice(0,7)+'-01T00:00:00+09:00')};
}
function sumSince(start:number){return (rawDb.prepare('SELECT COALESCE(SUM(cost_yen),0) n FROM ai_usage WHERE created_at>=?').get(start) as {n:number}).n;}
export function reserveUsage(provider:string,model:string,params:ChatParams):string{
 return rawDb.transaction(()=>{
  const b=getBudget(),rate=b.rates[model];
  if(!rate)throw new LLMBudgetError('このモデルの単価が未登録です。設定のAI費用欄で単価を登録してください。');
  // UTF-8 bytes plus envelope allowance: conservative input estimate, not billing tokens.
  const input=Buffer.byteLength(params.systemPrompt+params.userPrompt,'utf8')+8192;
  const output=params.maxOutputTokens??4096;
  const reservation=(input*rate.input+output*rate.output)/1e6*b.yenPerUsd;
  const t=starts();
  if(sumSince(t.day)+reservation>b.dailyYen||sumSince(t.month)+reservation>b.monthlyYen)throw new LLMBudgetError('AIの概算予算上限に達しました。次の期間を待つか、設定で上限を変更してください。');
  const id=randomUUID();
  rawDb.prepare(`INSERT INTO ai_usage(id,created_at,provider,model,purpose,status,input_usd_per_million,output_usd_per_million,yen_per_usd,reserved_yen,cost_yen) VALUES(?,?,?,?,?,'reserved',?,?,?,?,?)`).run(id,Date.now(),provider,model,params.purpose??'other',rate.input,rate.output,b.yenPerUsd,reservation,reservation);
  return id;
 }).immediate();
}
export function finishUsage(id:string,usage:Usage|null,status:string){
 const row=rawDb.prepare('SELECT * FROM ai_usage WHERE id=?').get(id) as {input_usd_per_million:number;output_usd_per_million:number;yen_per_usd:number;reserved_yen:number};
 const known=usage?.known===true&&Number.isFinite(usage.inputTokens)&&Number.isFinite(usage.outputTokens)&&usage.inputTokens>=0&&usage.outputTokens>=0;
 const cost=known?(usage!.inputTokens*row.input_usd_per_million+usage!.outputTokens*row.output_usd_per_million)/1e6*row.yen_per_usd:row.reserved_yen;
 rawDb.prepare('UPDATE ai_usage SET input_tokens=?,output_tokens=?,cost_yen=?,status=?,completed_at=? WHERE id=?').run(known?usage!.inputTokens:null,known?usage!.outputTokens:null,cost,known?status:status+'_estimated',Date.now(),id);
}
export function getUsageReport(){
 const t=starts();
 return {budget:getBudget(),todayYen:sumSince(t.day),monthYen:sumSince(t.month),
  since:(rawDb.prepare('SELECT MIN(created_at) n FROM ai_usage').get() as {n:number|null}).n,
  models:rawDb.prepare('SELECT model,COUNT(*) calls,SUM(input_tokens) inputTokens,SUM(output_tokens) outputTokens,SUM(cost_yen) yen,SUM(input_tokens IS NULL) estimated FROM ai_usage WHERE created_at>=? GROUP BY model').all(t.month),
  recent:rawDb.prepare('SELECT created_at,model,purpose,status,cost_yen FROM ai_usage ORDER BY created_at DESC LIMIT 15').all()};
}
export function meteredProvider(inner:LLMProvider,model:string):LLMProvider{
 return {name:inner.name,
  async chat(params){
   const id=reserveUsage(inner.name,model,params);let usage:Usage|null=null;
   try{const result=await inner.chat({...params,onUsage:u=>{usage=u;params.onUsage?.(u)}});
    usage=usage??{inputTokens:result.inputTokens,outputTokens:result.outputTokens,known:result.usageKnown!==false&&(result.inputTokens>0||result.outputTokens>0)};
    finishUsage(id,usage,'success');return result;
   }catch(e){finishUsage(id,usage,'failed');throw e;}
  },
  async *chatStream(params){
   const id=reserveUsage(inner.name,model,{...params,maxOutputTokens:params.maxOutputTokens??4096});let usage:Usage|null=null;let status='interrupted';
   try{for await(const chunk of inner.chatStream({...params,onUsage:u=>{usage=u;params.onUsage?.(u)}}))yield chunk;status='success';}
   catch(e){status='failed';throw e;}
   finally{finishUsage(id,status==='success'?usage:null,status);}
  }
 };
}
