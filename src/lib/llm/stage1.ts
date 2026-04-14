import { eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { articles } from "../db/schema";
import { getSettings } from "../settings";
import { createProvider, LLMBlockedError, LLMNoApiKeyError } from "./provider";
import { STAGE1_SYSTEM, STAGE1_SYSTEM_JP, stage1UserPrompt, isJapaneseTitle } from "./prompts";
import { parseAndValidate, stage1Schema } from "./parse-response";

const BATCH_TIMEOUT_MS = 5 * 60 * 1000;
const RATE_LIMIT_MS = 500;

export async function processStage1ForArticles(articleIds: string[]): Promise<void> {
  if (articleIds.length === 0) return;
  const settings = getSettings();

  const provider = (() => {
    try {
      return createProvider(settings.stage1Provider, settings.geminiModelStage1);
    } catch (e) {
      if (e instanceof LLMNoApiKeyError) {
        console.log(`[yomu] stage1: no API key for ${settings.stage1Provider}, skipping`);
        return null;
      }
      throw e;
    }
  })();
  if (!provider) return;

  const rows = db
    .select()
    .from(articles)
    .where(inArray(articles.id, articleIds))
    .all();

  const start = Date.now();
  for (const article of rows) {
    if (Date.now() - start > BATCH_TIMEOUT_MS) {
      console.warn("[yomu] stage1: batch timeout");
      break;
    }

    db.update(articles)
      .set({ aiStage1Status: "processing" })
      .where(eq(articles.id, article.id))
      .run();

    try {
      const isJp = isJapaneseTitle(article.title);
      const result = await provider.chat({
        systemPrompt: isJp ? STAGE1_SYSTEM_JP : STAGE1_SYSTEM,
        userPrompt: stage1UserPrompt(article.title, article.contentPlain ?? ""),
      });
      const parsed = parseAndValidate(result.content, stage1Schema);
      db.update(articles)
        .set({
          aiSummaryShort: parsed.summary,
          aiTitleJa: parsed.titleJa ?? null,
          aiTags: JSON.stringify(parsed.tags),
          detectedLanguage: parsed.detectedLanguage ?? article.detectedLanguage,
          aiStage1Status: "done",
          aiStage1Error: null,
          aiStage1ProcessedAt: Date.now(),
        })
        .where(eq(articles.id, article.id))
        .run();
    } catch (e) {
      if (e instanceof LLMNoApiKeyError) {
        db.update(articles)
          .set({ aiStage1Status: "pending" })
          .where(eq(articles.id, article.id))
          .run();
        break;
      }
      const status = e instanceof LLMBlockedError ? "skipped" : "failed";
      db.update(articles)
        .set({
          aiStage1Status: status,
          aiStage1Error: e instanceof Error ? e.message : String(e),
          aiStage1ProcessedAt: Date.now(),
        })
        .where(eq(articles.id, article.id))
        .run();
    }

    await new Promise((r) => setTimeout(r, RATE_LIMIT_MS));
  }
}

export function getPendingStage1Ids(limit: number = 100): string[] {
  const rows = db
    .select({ id: articles.id })
    .from(articles)
    .where(eq(articles.aiStage1Status, "pending"))
    .limit(limit)
    .all();
  return rows.map((r) => r.id);
}
