import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { articles } from "@/lib/db/schema";
import { withAuth, jsonError } from "@/lib/api-helpers";
import { getSettings } from "@/lib/settings";
import { createProvider, LLMNoApiKeyError } from "@/lib/llm/provider";
import { STAGE2_SYSTEM, stage2UserPrompt } from "@/lib/llm/prompts";
import { parseAndValidate, stage2Schema } from "@/lib/llm/parse-response";

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  return withAuth(async () => {
    const { id } = await ctx.params;
    const article = db.select().from(articles).where(eq(articles.id, id)).get();
    if (!article) return jsonError(404, "Not found");

    if (article.aiStage2Status === "processing") {
      return jsonError(409, "Already processing");
    }

    const settings = getSettings();

    let provider;
    try {
      provider = createProvider(settings.stage2Provider, settings.geminiModelStage2);
    } catch (e) {
      if (e instanceof LLMNoApiKeyError) {
        return jsonError(400, `${settings.stage2Provider} API key is not configured`);
      }
      throw e;
    }

    if (!article.contentPlain || article.contentPlain.length < 20) {
      return jsonError(422, "Content too short to summarize");
    }

    db.update(articles)
      .set({ aiStage2Status: "processing", aiStage2Error: null })
      .where(eq(articles.id, id))
      .run();

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        function send(event: string, data: unknown) {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        }

        try {
          let fullContent = "";
          const gen = provider.chatStream({
            systemPrompt: STAGE2_SYSTEM,
            userPrompt: stage2UserPrompt(article.title, article.contentPlain!, article.contentHtml),
            maxOutputTokens: 8192,
          });

          for await (const chunk of gen) {
            fullContent += chunk;
            send("chunk", { text: chunk });
          }

          const parsed = parseAndValidate(fullContent, stage2Schema);

          db.update(articles)
            .set({
              aiSummaryFull: parsed.summaryFull,
              aiTranslation: parsed.translation,
              aiKeyPoints: JSON.stringify(parsed.keyPoints),
              aiRelatedLinks: JSON.stringify(parsed.relatedLinks),
              aiStage2Status: "done",
              aiStage2Error: null,
              aiStage2ProcessedAt: Date.now(),
            })
            .where(eq(articles.id, id))
            .run();

          const updated = db.select().from(articles).where(eq(articles.id, id)).get();
          send("done", updated);
        } catch (e) {
          console.error("[ai/stage2] error:", e);
          const message = e instanceof Error ? e.message : String(e);
          db.update(articles)
            .set({
              aiStage2Status: "failed",
              aiStage2Error: message,
            })
            .where(eq(articles.id, id))
            .run();

          send("error", { message });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  });
}
