import type { LLMProvider, ChatParams, ChatResult } from "./provider";
import { LLMApiError, LLMBlockedError, LLMEmptyResponseError } from "./provider";

interface GeminiResponse {
  candidates?: {
    content?: { parts?: { text?: string }[] };
    finishReason?: string;
    safetyRatings?: unknown;
  }[];
  promptFeedback?: { blockReason?: string };
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
}

export class GeminiProvider implements LLMProvider {
  readonly name = "gemini";

  constructor(
    private apiKey: string,
    private model: string,
  ) {}

  async chat(params: ChatParams): Promise<ChatResult> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent?key=${this.apiKey}`;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: params.systemPrompt }] },
        contents: [{ role: "user", parts: [{ text: params.userPrompt }] }],
        generationConfig: {
          temperature: params.temperature ?? 0.3,
          maxOutputTokens: params.maxOutputTokens ?? 1024,
          responseMimeType: "application/json",
        },
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      throw new LLMApiError(res.status, await res.text());
    }

    const data = (await res.json()) as GeminiResponse;

    if (!data.candidates || data.candidates.length === 0) {
      throw new LLMBlockedError(data.promptFeedback?.blockReason ?? "UNKNOWN");
    }

    const candidate = data.candidates[0]!;
    if (candidate.finishReason === "SAFETY") {
      throw new LLMBlockedError(candidate.safetyRatings);
    }

    const content = candidate.content?.parts?.[0]?.text;
    if (!content) throw new LLMEmptyResponseError();

    return {
      content,
      inputTokens: data.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
    };
  }

  async *chatStream(params: ChatParams): AsyncGenerator<string> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:streamGenerateContent?alt=sse&key=${this.apiKey}`;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: params.systemPrompt }] },
        contents: [{ role: "user", parts: [{ text: params.userPrompt }] }],
        generationConfig: {
          temperature: params.temperature ?? 0.3,
          maxOutputTokens: params.maxOutputTokens ?? 4096,
          responseMimeType: "application/json",
        },
      }),
      signal: AbortSignal.timeout(120_000),
    });

    if (!res.ok) {
      throw new LLMApiError(res.status, await res.text());
    }

    const reader = res.body?.getReader();
    if (!reader) throw new LLMEmptyResponseError();

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const jsonStr = line.slice(6).trim();
        if (!jsonStr) continue;
        try {
          const data = JSON.parse(jsonStr) as GeminiResponse;
          const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) yield text;
        } catch {
          // skip malformed SSE chunks
        }
      }
    }
  }
}
