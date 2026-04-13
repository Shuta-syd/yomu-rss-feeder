import Anthropic from "@anthropic-ai/sdk";
import type { LLMProvider, ChatParams, ChatResult } from "./provider";
import { LLMApiError, LLMBlockedError, LLMEmptyResponseError } from "./provider";

export class AnthropicProvider implements LLMProvider {
  readonly name = "anthropic";
  private client: Anthropic;

  constructor(
    apiKey: string,
    private model: string,
  ) {
    this.client = new Anthropic({ apiKey });
  }

  async chat(params: ChatParams): Promise<ChatResult> {
    try {
      const res = await this.client.messages.create({
        model: this.model,
        system: params.systemPrompt,
        messages: [{ role: "user", content: params.userPrompt }],
        temperature: params.temperature ?? 0.3,
        max_tokens: params.maxOutputTokens ?? 1024,
      });

      if (res.stop_reason === "end_turn" || res.stop_reason === "max_tokens") {
        // normal
      }

      const textBlock = res.content.find((b) => b.type === "text");
      if (!textBlock || textBlock.type !== "text") throw new LLMEmptyResponseError();

      return {
        content: textBlock.text,
        inputTokens: res.usage.input_tokens,
        outputTokens: res.usage.output_tokens,
      };
    } catch (e) {
      if (e instanceof Anthropic.APIError) {
        if (e.status === 400 && String(e.message).includes("safety")) {
          throw new LLMBlockedError(e.message);
        }
        throw new LLMApiError(e.status ?? 500, e.message);
      }
      throw e;
    }
  }

  async *chatStream(params: ChatParams): AsyncGenerator<string> {
    try {
      const stream = this.client.messages.stream({
        model: this.model,
        system: params.systemPrompt,
        messages: [{ role: "user", content: params.userPrompt }],
        temperature: params.temperature ?? 0.3,
        max_tokens: params.maxOutputTokens ?? 4096,
      });

      for await (const event of stream) {
        if (
          event.type === "content_block_delta" &&
          event.delta.type === "text_delta"
        ) {
          yield event.delta.text;
        }
      }
    } catch (e) {
      if (e instanceof Anthropic.APIError) {
        throw new LLMApiError(e.status ?? 500, e.message);
      }
      throw e;
    }
  }
}
