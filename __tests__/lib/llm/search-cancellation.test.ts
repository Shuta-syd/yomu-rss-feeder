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
