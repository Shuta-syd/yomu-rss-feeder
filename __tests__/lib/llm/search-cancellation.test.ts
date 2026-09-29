import {afterEach,expect,it,vi} from 'vitest';
import {GeminiProvider} from '@/lib/llm/gemini';
import {OpenAIProvider} from '@/lib/llm/openai';
import {AnthropicProvider} from '@/lib/llm/anthropic';
afterEach(()=>vi.unstubAllGlobals());
it.each([['Gemini',GeminiProvider],['OpenAI',OpenAIProvider],['Anthropic',AnthropicProvider]] as const)('propagates search cancellation to %s HTTP requests',async (_name,Provider)=>{
 const controller=new AbortController();
 let received:AbortSignal|null|undefined;
 vi.stubGlobal('fetch',async(input:RequestInfo|URL,init?:RequestInit)=>{
  received=init?.signal ?? (input instanceof Request ? input.signal : undefined);
  controller.abort();
  throw new Error('network fixture');
 });
 const provider=new Provider('fake-key','test-model');
 await expect(provider.chat({systemPrompt:'test',userPrompt:'test',signal:controller.signal})).rejects.toThrow();
 expect(received).toBeDefined();controller.abort();expect(received?.aborted).toBe(true);
});
it('sends the required JSON schema to Gemini when supplied',async()=>{
 let config:Record<string,unknown>|undefined;
 vi.stubGlobal('fetch',async(_url:RequestInfo|URL,init?:RequestInit)=>{
  config=JSON.parse(String(init?.body)).generationConfig;
  return Response.json({candidates:[{content:{parts:[{text:'{"summary":"ok"}'}]}}],usageMetadata:{promptTokenCount:10,candidatesTokenCount:5}});
 });
 const provider=new GeminiProvider('fake-key','gemini-3.1-flash-lite');
 await provider.chat({systemPrompt:'Summarize',userPrompt:'Article',responseSchema:{type:'object',properties:{summary:{type:'string'}},required:['summary']}});
 expect(config?.responseJsonSchema).toEqual({type:'object',properties:{summary:{type:'string'}},required:['summary']});
});
