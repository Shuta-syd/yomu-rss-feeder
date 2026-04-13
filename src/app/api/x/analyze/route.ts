import { NextResponse } from "next/server";
import { withAuth, jsonError } from "@/lib/api-helpers";
import { db } from "@/lib/db";
import { xLikes, xAnalyses } from "@/lib/db/schema";
import { desc } from "drizzle-orm";
import { getSettings } from "@/lib/settings";
import { createProvider, LLMNoApiKeyError } from "@/lib/llm/provider";
import { v7 as uuidv7 } from "uuid";

const SYSTEM_PROMPT = `あなたはソーシャルメディア分析の専門家です。ユーザーのXいいね履歴を分析し、以下のJSON形式で結果を返してください。
JSON以外のテキストは出力しないでください。

{
  "trends": ["トレンド1", "トレンド2", ...],
  "topics": ["トピック1", "トピック2", ...],
  "notableAccounts": [{"username": "xxx", "reason": "理由"}],
  "summary": "全体的なサマリー"
}`;

export async function POST() {
  return withAuth(async () => {
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

    // 直近のいいね(最大200件)を取得
    const likes = db
      .select()
      .from(xLikes)
      .orderBy(desc(xLikes.likedAt))
      .limit(200)
      .all();

    if (likes.length === 0) {
      return jsonError(422, "いいねデータがありません。先にいいねを取得してください。");
    }

    const likesText = likes
      .map((l, i) => `${i + 1}. @${l.authorUsername}: ${l.text}`)
      .join("\n");

    const userPrompt = `以下はユーザーのXいいね履歴です。興味関心のトレンド、よく見るトピック、注目しているアカウントを分析してJSON形式で返してください。\n\n${likesText}`;

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        function send(event: string, data: unknown) {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        }

        try {
          let fullContent = "";
          const gen = provider.chatStream({
            systemPrompt: SYSTEM_PROMPT,
            userPrompt,
            maxOutputTokens: 4096,
          });

          for await (const chunk of gen) {
            fullContent += chunk;
            send("chunk", { text: chunk });
          }

          // JSONパース (コードブロックの場合は除去)
          let jsonStr = fullContent.trim();
          const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
          if (fenceMatch) jsonStr = fenceMatch[1]!.trim();

          let parsed;
          try {
            parsed = JSON.parse(jsonStr);
          } catch {
            // JSON修復を試行: 最初の { から最後の } を抽出
            const start = fullContent.indexOf("{");
            const end = fullContent.lastIndexOf("}");
            if (start >= 0 && end > start) {
              parsed = JSON.parse(fullContent.slice(start, end + 1));
            } else {
              throw new Error("AI応答のJSONパースに失敗しました");
            }
          }

          // xAnalysesに保存
          const periodStart = likes[likes.length - 1]!.likedAt;
          const periodEnd = likes[0]!.likedAt;
          const analysisId = uuidv7();

          db.insert(xAnalyses).values({
            id: analysisId,
            periodStart,
            periodEnd,
            likeCount: likes.length,
            summaryJson: JSON.stringify(parsed),
          }).run();

          send("done", { id: analysisId, ...parsed });
        } catch (e) {
          console.error("[x/analyze] error:", e);
          const message = e instanceof Error ? e.message : String(e);
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
