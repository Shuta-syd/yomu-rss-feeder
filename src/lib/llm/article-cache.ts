import { createHash, randomUUID } from 'node:crypto';
import { rawDb } from '../db';
import { articleUrlKey } from '../article-groups';
import type { ChatParams } from './provider';

const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const LEASE_MS = 5 * 60 * 1000;
export class AIResultBusyError extends Error {
  constructor() { super('同じ記事をAI処理中です。少し待ってから再試行してください。'); }
}
interface Request {
  url: string;
  provider: string;
  model: string;
  params: ChatParams;
  fresh?: boolean;
}
interface CacheRow { content: string | null; owner: string | null }

/** Only identical requests for the same source are interchangeable. Never match on headlines alone. */
export async function reuseArticleResult(
  request: Request,
  generate: () => Promise<string>,
  validate: (content: string) => void,
): Promise<{ content: string; reused: boolean }> {
  const url = articleUrlKey(request.url);
  if (!url) {
    const content = await generate();
    validate(content);
    return { content, reused: false };
  }
  const { systemPrompt, userPrompt, purpose, temperature, maxOutputTokens } = request.params;
  const key = createHash('sha256').update(JSON.stringify([
    'article-result-v1', url, request.provider, request.model,
    systemPrompt, userPrompt, purpose, temperature ?? 0.3, maxOutputTokens,
  ])).digest('hex');
  const owner = randomUUID();
  const deadline = Date.now() + (purpose === 'detail' ? 125_000 : 35_000);
  for (;;) {
    // Shared SQLite transaction coordinates web requests and the separate worker process.
    const claim = rawDb.transaction(() => {
      const now = Date.now();
      rawDb.prepare('DELETE FROM ai_result_cache WHERE expires_at <= ?').run(now);
      const row = rawDb.prepare('SELECT content,owner FROM ai_result_cache WHERE cache_key=?').get(key) as CacheRow | undefined;
      if (row?.content != null && !request.fresh) {
        try { validate(row.content); }
        catch { rawDb.prepare('DELETE FROM ai_result_cache WHERE cache_key=?').run(key); return { retry: true } as const; }
        rawDb.prepare('UPDATE ai_result_cache SET reuse_count=reuse_count+1 WHERE cache_key=?').run(key);
        return { content: row.content } as const;
      }
      if (row?.owner) return { busy: true } as const;
      rawDb.prepare(`INSERT INTO ai_result_cache(cache_key,content,owner,expires_at) VALUES(?,NULL,?,?)
        ON CONFLICT(cache_key) DO UPDATE SET content=NULL,owner=excluded.owner,expires_at=excluded.expires_at`).run(key,owner,now+LEASE_MS);
      return { acquired: true } as const;
    }).immediate();
    if ('content' in claim) return { content: claim.content!, reused: true };
    if ('retry' in claim) continue;
    if ('acquired' in claim) break;
    if (Date.now() >= deadline) throw new AIResultBusyError();
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  try {
    const content = await generate();
    validate(content);
    // A late response may not overwrite a newer lease/result after recovery.
    rawDb.prepare('UPDATE ai_result_cache SET content=?,owner=NULL,expires_at=? WHERE cache_key=? AND owner=?')
      .run(content,Date.now()+RETENTION_MS,key,owner);
    return { content, reused: false };
  } catch (error) {
    rawDb.prepare('DELETE FROM ai_result_cache WHERE cache_key=? AND owner=?').run(key,owner);
    throw error;
  }
}
