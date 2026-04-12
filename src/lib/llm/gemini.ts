import { getDecryptedApiKey } from "../settings";

export interface GeminiChatParams {
  model: string;
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  maxOutputTokens?: number;
}

export interface GeminiChatResult {
  content: string;
  inputTokens: number;
  outputTokens: number;
}

export class GeminiApiError extends Error {
  constructor(
    public status: number,
    public body: string,
  ) {
    super(`Gemini API error ${status}: ${body.slice(0, 200)}`);
  }
}

export class GeminiBlockedError extends Error {
  constructor(public reason: unknown) {
    super(`Gemini safety block: ${JSON.stringify(reason)}`);
  }
}

export class GeminiEmptyResponseError extends Error {
  constructor() {
    super("Gemini returned empty response");
  }
}

export class GeminiNoApiKeyError extends Error {
  constructor() {
    super("Gemini API key is not configured");
  }
}

interface GeminiResponse {
  candidates?: {
    content?: { parts?: { text?: string }[] };
    finishReason?: string;
    safetyRatings?: unknown;
  }[];
  promptFeedback?: { blockReason?: string };
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
}

export async function geminiChat(params: GeminiChatParams): Promise<GeminiChatResult> {
  const apiKey = getDecryptedApiKey();
  if (!apiKey) throw new GeminiNoApiKeyError();

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(params.model)}:generateContent?key=${apiKey}`;

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
    throw new GeminiApiError(res.status, await res.text());
  }

  const data = (await res.json()) as GeminiResponse;

  if (!data.candidates || data.candidates.length === 0) {
    throw new GeminiBlockedError(data.promptFeedback?.blockReason ?? "UNKNOWN");
  }

  const candidate = data.candidates[0]!;
  if (candidate.finishReason === "SAFETY") {
    throw new GeminiBlockedError(candidate.safetyRatings);
  }

  const content = candidate.content?.parts?.[0]?.text;
  if (!content) throw new GeminiEmptyResponseError();

  return {
    content,
    inputTokens: data.usageMetadata?.promptTokenCount ?? 0,
    outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
  };
}

/**
 * Gemini streaming API — テキストチャンクをyieldする
 */
export async function* geminiChatStream(params: GeminiChatParams): AsyncGenerator<string> {
  const apiKey = getDecryptedApiKey();
  if (!apiKey) throw new GeminiNoApiKeyError();

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(params.model)}:streamGenerateContent?alt=sse&key=${apiKey}`;

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
    throw new GeminiApiError(res.status, await res.text());
  }

  const reader = res.body?.getReader();
  if (!reader) throw new GeminiEmptyResponseError();

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
