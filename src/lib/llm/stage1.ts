import { AIResultBusyError, reuseArticleResult } from "./article-cache";
import type { ChatParams } from "./provider";
import { LLMBudgetError } from "./usage";
import { and, eq, inArray } from "drizzle-orm";
import { db, rawDb } from "../db";
import { articles, feeds } from "../db/schema";
import { getSettings } from "../settings";
import { createProvider, LLMApiError, LLMBlockedError, LLMNoApiKeyError } from "./provider";
import {
  STAGE1_SYSTEM,
  STAGE1_SYSTEM_JP,
  stage1UserPrompt,
  isJapaneseTitle,
  composeStage1System,
} from "./prompts";
import { parseAndValidate, stage1Schema } from "./parse-response";

import { classificationSchema, classificationOnlySchema, stage1ResponseSchema, readManualClassification, replaceClassificationTags, CLASSIFICATION_INSTRUCTIONS } from "./classification";
const classifiedStage1Schema = stage1Schema.extend({ classification: classificationSchema });

const BATCH_TIMEOUT_MS = 5 * 60 * 1000;
const RATE_LIMIT_MS = 250;

export async function processStage1ForArticles(articleIds: string[], options: { forceSummary?: boolean } = {}): Promise<void> {
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
    .select({ article: articles, summaryLens: feeds.summaryLens, aiEnabled: feeds.aiEnabled })
    .from(articles)
    .innerJoin(feeds, eq(articles.feedId, feeds.id))
    .where(and(inArray(articles.id, articleIds), eq(articles.aiStage1Status, "pending")))
    .all();

  const start = Date.now();
  for (const { article, summaryLens, aiEnabled } of rows) {
    if (Date.now() - start > BATCH_TIMEOUT_MS) {
      console.warn("[yomu] stage1: batch timeout");
      break;
    }

    const claimed = db.update(articles)
      .set({ aiStage1Status: "processing" })
      .where(and(eq(articles.id, article.id), eq(articles.aiStage1Status, "pending")))
      .run();
    if (!claimed.changes) continue;

    try {
      const summarize = aiEnabled || options.forceSummary === true;
      const isJp = isJapaneseTitle(article.title);
      const params: ChatParams = {
        systemPrompt: (summarize
          ? composeStage1System(isJp ? STAGE1_SYSTEM_JP : STAGE1_SYSTEM, summaryLens)
          : "記事を分類してください。要約・翻訳は生成せずclassificationだけをJSONで返してください。") + CLASSIFICATION_INSTRUCTIONS,
        userPrompt: stage1UserPrompt(article.title, summarize ? (article.contentPlain ?? "") : (article.contentPlain ?? "").slice(0, 6000)),
        maxOutputTokens: 2048,
        responseSchema: stage1ResponseSchema(summarize),
        purpose: summarize ? "summary_classification" : "classification",
      };
      const result = await reuseArticleResult({
        url: article.url, provider: settings.stage1Provider, model: settings.geminiModelStage1,
        params, fresh: options.forceSummary === true,
      }, async () => {
        try { return (await provider.chat(params)).content; }
        catch (error) {
          // Retry brief provider outages once. Billing/auth failures need intervention.
          if (!(error instanceof LLMApiError) || ![500,502,503,504].includes(error.status)) throw error;
          await new Promise(resolve=>setTimeout(resolve,1000));
          return (await provider.chat(params)).content;
        }
      }, content => {
        parseAndValidate(content, summarize ? classifiedStage1Schema : classificationOnlySchema);
      });
      const parsed = summarize ? parseAndValidate(result.content, classifiedStage1Schema) : null;
      const classification = parsed?.classification ?? parseAndValidate(result.content, classificationOnlySchema).classification;
      // Read the latest manual choice and save atomically: edits during generation win.
      rawDb.transaction(() => {
        const current = db.select().from(articles).where(eq(articles.id, article.id)).get();
        if (!current) return;
        const effective = readManualClassification(current.manualClassification) ?? classification;
        db.update(articles)
          .set({
            ...(parsed ? {
              aiSummaryShort: parsed.summary,
              aiTitleJa: parsed.titleJa ?? null,
              detectedLanguage: parsed.detectedLanguage ?? current.detectedLanguage,
            } : {}),
            aiTags: replaceClassificationTags(parsed ? JSON.stringify(parsed.tags) : current.aiTags, effective),
            aiStage1Status: "done",
            aiStage1Error: null,
            aiStage1ProcessedAt: Date.now(),
          })
          .where(eq(articles.id, article.id)).run();
      }).immediate();
    } catch (e) {
      if (e instanceof AIResultBusyError) {
        db.update(articles).set({ aiStage1Status: "pending", aiStage1Error: e.message })
          .where(eq(articles.id, article.id)).run();
        continue;
      }
      if (e instanceof LLMNoApiKeyError || e instanceof LLMBudgetError) {
        db.update(articles)
          .set({ aiStage1Status: "pending", aiStage1Error: e.message })
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
      // Leave the rest pending instead of turning an outage into thousands of failures.
      if(e instanceof LLMApiError && (e.status===401||e.status===403||e.status===429||e.status>=500))break;
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
