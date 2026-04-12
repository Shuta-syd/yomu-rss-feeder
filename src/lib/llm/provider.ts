import type { ProviderType } from "../settings";
import { getDecryptedKey } from "../settings";
import { GeminiProvider } from "./gemini";
import { OpenAIProvider } from "./openai";
import { AnthropicProvider } from "./anthropic";

export interface ChatParams {
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  maxOutputTokens?: number;
}

export interface ChatResult {
  content: string;
  inputTokens: number;
  outputTokens: number;
}

export interface LLMProvider {
  readonly name: string;
  chat(params: ChatParams): Promise<ChatResult>;
  chatStream(params: ChatParams): AsyncGenerator<string>;
}

export class LLMApiError extends Error {
  constructor(
    public status: number,
    public body: string,
  ) {
    super(`LLM API error ${status}: ${body.slice(0, 200)}`);
  }
}

export class LLMBlockedError extends Error {
  constructor(public reason: unknown) {
    super(`LLM safety block: ${JSON.stringify(reason)}`);
  }
}

export class LLMEmptyResponseError extends Error {
  constructor() {
    super("LLM returned empty response");
  }
}

export class LLMNoApiKeyError extends Error {
  constructor(provider: string) {
    super(`${provider} API key is not configured`);
  }
}

export { type ProviderType } from "../settings";

const API_KEY_MAP: Record<ProviderType, string> = {
  gemini: "gemini_api_key",
  openai: "openai_api_key",
  anthropic: "anthropic_api_key",
};

export function createProvider(type: ProviderType, model: string): LLMProvider {
  const apiKey = getDecryptedKey(API_KEY_MAP[type]);
  if (!apiKey) throw new LLMNoApiKeyError(type);

  switch (type) {
    case "gemini":
      return new GeminiProvider(apiKey, model);
    case "openai":
      return new OpenAIProvider(apiKey, model);
    case "anthropic":
      return new AnthropicProvider(apiKey, model);
  }
}
