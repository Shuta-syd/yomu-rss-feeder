import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createTestDb } from '../../helpers/test-db';
let testDb: ReturnType<typeof createTestDb>;
const chat = vi.hoisted(() => vi.fn());
const chatStream = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api-helpers', () => ({ withAuth: async (fn: () => Promise<unknown>) => fn(), jsonError: (status: number, message: string) => new Response(message,{status}) }));
vi.mock('@/lib/db', () => ({ get db() { return testDb.db; }, get rawDb() { return testDb.raw; } }));
vi.mock('@/lib/settings', () => ({ getSettings: () => ({ stage1Provider: 'gemini', geminiModelStage1: 'test', stage2Provider: 'gemini', geminiModelStage2: 'test' }) }));
vi.mock('@/lib/llm/provider', async original => ({ ...await original<object>(), createProvider: () => ({ chat, chatStream }) }));
import { POST } from '@/app/api/articles/[id]/ai/route';
import { NextRequest } from 'next/server';
import { processStage1ForArticles } from '@/lib/llm/stage1';
const result = { summary: '農業ロボットの実証実験', titleJa: '農業ロボット', tags: ['AI'], classification: { genre: 'テクノロジー', industries: ['食品・農業'], topics: ['AI'] } };
beforeEach(() => {
 testDb = createTestDb(); chatStream.mockReset(); chat.mockReset(); chat.mockResolvedValue({ content: JSON.stringify(result) });
 for (const id of ['a','b']) {
  testDb.raw.prepare('INSERT INTO feeds(id,title,url,ai_enabled,created_at) VALUES(?,?,?,1,1)').run(id,id,`https://feed.example/${id}`);
  testDb.raw.prepare('INSERT INTO articles(id,feed_id,title,url,content_plain,dedup_hash,sort_key,created_at) VALUES(?,?,?,?,?,?,1,1)').run(id,id,'Farm robots',`https://example.com/news?utm_source=${id}`,'A farm tests robots.',id);
 }
});
afterEach(() => testDb.close());
it('reuses one successful generation across feeds while keeping each article', async () => {
 await processStage1ForArticles(['a']); await processStage1ForArticles(['b']);
 expect(chat).toHaveBeenCalledTimes(1);
 expect(testDb.raw.prepare('SELECT id,ai_stage1_status status,ai_summary_short summary FROM articles ORDER BY id').all()).toEqual(['a','b'].map(id => ({id,status:'done',summary:result.summary})));
});
it.each(['body','lens','url'])('does not reuse when %s differs', async field => {
 if(field==='body')testDb.raw.exec("UPDATE articles SET content_plain='Updated facts.' WHERE id='b'");
 if(field==='lens')testDb.raw.exec("UPDATE feeds SET summary_lens='投資の観点' WHERE id='b'");
 if(field==='url')testDb.raw.exec("UPDATE articles SET url='https://example.com/other' WHERE id='b'");
 await processStage1ForArticles(['a','b']); expect(chat).toHaveBeenCalledTimes(2);
});
it('coalesces simultaneous processing of matching articles', async () => {
 chat.mockImplementation(async()=>{ await new Promise(r=>setTimeout(r,50)); return {content:JSON.stringify(result)}; });
 await Promise.all([processStage1ForArticles(['a']),processStage1ForArticles(['b'])]);
 expect(chat).toHaveBeenCalledTimes(1);
 expect(testDb.raw.prepare("SELECT count(*) n FROM articles WHERE ai_stage1_status='done'").get()).toEqual({n:2});
});
it('does not reuse a failed or invalid result', async () => {
 chat.mockResolvedValueOnce({content:'{"classification":{"genre":"bad"}}'});
 await processStage1ForArticles(['a','b']); expect(chat).toHaveBeenCalledTimes(2);
 expect(testDb.raw.prepare("SELECT ai_stage1_status status FROM articles WHERE id='b'").get()).toEqual({status:'done'});
});

const detail = {summaryFull:'農業ロボットの試験運用です。',translation:'## 農業\n\n収穫ロボットを試験中。',keyPoints:['試験運用'],relatedLinks:[]};
async function detailRequest(id: string) {
 const response = await POST(new NextRequest(`http://localhost/api/articles/${id}/ai`, {method:'POST'}),{params:Promise.resolve({id})});
 return response.text();
}
it('reuses detail translation with the same streaming response contract', async () => {
 testDb.raw.exec("UPDATE articles SET content_plain='A farm tests new harvesting robots in its greenhouse.'");
 chatStream.mockImplementation(async function*(){yield JSON.stringify(detail);});
 const first = await detailRequest('a'), second = await detailRequest('b');
 expect(first).toContain('event: done');expect(second).toContain('event: done');
 expect(chatStream).toHaveBeenCalledTimes(1);
 const rows=testDb.raw.prepare('SELECT ai_summary_full summary,ai_translation translation FROM articles').all();
 expect(rows).toEqual([expect.objectContaining({summary:detail.summaryFull,translation:expect.stringContaining('<h2>農業</h2>')}),expect.objectContaining({summary:detail.summaryFull,translation:expect.stringContaining('<h2>農業</h2>')})]);
 // Explicit regeneration of a completed article must still call the model.
 await detailRequest('b'); expect(chatStream).toHaveBeenCalledTimes(2);
});
