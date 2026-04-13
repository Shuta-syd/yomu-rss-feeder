import OpenAI from "openai";
import type { LLMProvider, ChatParams, ChatResult } from "./provider";
import { LLMApiError, LLMBlockedError, LLMEmptyResponseError } from "./provider";

export class OpenAIProvider implements LLMProvider {
  readonly name = "openai";
  private client: OpenAI;

  constructor(
    apiKey: string,
    private model: string,
  ) {
    this.client = new OpenAI({ apiKey });
  }

  async chat(params: ChatParams): Promise<ChatResult> {
    try {
      const res = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: "system", content: params.systemPrompt },
          { role: "user", content: params.userPrompt },
        ],
        temperature: params.temperature ?? 0.3,
        max_tokens: params.maxOutputTokens ?? 1024,
        response_format: { type: "json_object" },
      });

      const content = res.choices[0]?.message?.content;
      if (!content) throw new LLMEmptyResponseError();

      if (res.choices[0]?.finish_reason === "content_filter") {
        throw new LLMBlockedError("content_filter");
      }

      return {
        content,
        inputTokens: res.usage?.prompt_tokens ?? 0,
        outputTokens: res.usage?.completion_tokens ?? 0,
      };
    } catch (e) {
      if (e instanceof OpenAI.APIError) {
        throw new LLMApiError(e.status ?? 500, e.message);
      }
      throw e;
    }
  }

  async *chatStream(params: ChatParams): AsyncGenerator<string> {
    try {
      const stream = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: "system", content: params.systemPrompt },
          { role: "user", content: params.userPrompt },
        ],
        temperature: params.temperature ?? 0.3,
        max_tokens: params.maxOutputTokens ?? 4096,
        response_format: { type: "json_object" },
        stream: true,
      });

      for await (const chunk of stream) {
        const text = chunk.choices[0]?.delta?.content;
        if (text) yield text;
      }
    } catch (e) {
      if (e instanceof OpenAI.APIError) {
        throw new LLMApiError(e.status ?? 500, e.message);
      }
      throw e;
    }
  }
}
