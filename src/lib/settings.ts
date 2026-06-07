import { eq } from "drizzle-orm";
import { db } from "./db";
import { appConfig } from "./db/schema";
import { encrypt, decrypt } from "./crypto";

export type ProviderType = "gemini" | "openai" | "anthropic";

export interface Settings {
  hasGeminiApiKey: boolean;
  hasOpenaiApiKey: boolean;
  hasAnthropicApiKey: boolean;
  stage1Provider: ProviderType;
  stage2Provider: ProviderType;
  geminiModelStage1: string;
  geminiModelStage2: string;
  theme: "light" | "dark" | "system";
  autoMarkAsRead: boolean;
}

const DEFAULTS = {
  geminiModelStage1: "gemini-2.5-flash-lite",
  geminiModelStage2: "gemini-2.5-flash",
  stage1Provider: "gemini" as ProviderType,
  stage2Provider: "gemini" as ProviderType,
  theme: "system" as const,
  autoMarkAsRead: true,
};

export const PROVIDER_MODELS: Record<ProviderType, string[]> = {
  gemini: [
    "gemini-3-flash-preview",
    "gemini-2.5-flash-lite",
    "gemini-2.5-flash",
    "gemini-2.5-pro",
    "gemini-2.0-flash",
  ],
  openai: [
    "gpt-4o",
    "gpt-4o-mini",
    "gpt-4.1",
    "gpt-4.1-mini",
    "gpt-4.1-nano",
    "o4-mini",
  ],
  anthropic: [
    "claude-sonnet-4-6",
    "claude-haiku-4-5-20251001",
  ],
};

export class InvalidSettingsError extends Error {}

function providerForModel(model: string): ProviderType | null {
  for (const provider of Object.keys(PROVIDER_MODELS) as ProviderType[]) {
    if (PROVIDER_MODELS[provider].includes(model)) return provider;
  }
  return null;
}

function resolveStageModel(
  currentProvider: ProviderType,
  currentModel: string,
  inputProvider?: ProviderType,
  inputModel?: string,
): { provider: ProviderType; model: string } {
  if (inputModel) {
    const modelProvider = providerForModel(inputModel);
    if (!modelProvider) {
      throw new InvalidSettingsError(`Unsupported model: ${inputModel}`);
    }
    if (inputProvider && inputProvider !== modelProvider) {
      throw new InvalidSettingsError(`Model ${inputModel} does not belong to ${inputProvider}`);
    }
    return { provider: modelProvider, model: inputModel };
  }

  if (inputProvider) {
    const currentModelProvider = providerForModel(currentModel);
    if (inputProvider === currentProvider && currentModelProvider === inputProvider) {
      return { provider: inputProvider, model: currentModel };
    }
    return { provider: inputProvider, model: PROVIDER_MODELS[inputProvider][0]! };
  }

  const currentModelProvider = providerForModel(currentModel);
  if (currentModelProvider) {
    return { provider: inputProvider ?? currentModelProvider, model: currentModel };
  }

  const provider = inputProvider ?? currentProvider;
  return { provider, model: PROVIDER_MODELS[provider][0]! };
}

function get(key: string): string | undefined {
  return db.select().from(appConfig).where(eq(appConfig.key, key)).get()?.value;
}

function set(key: string, value: string): void {
  db.insert(appConfig)
    .values({ key, value })
    .onConflictDoUpdate({ target: appConfig.key, set: { value } })
    .run();
}

function del(key: string): void {
  db.delete(appConfig).where(eq(appConfig.key, key)).run();
}

export function getSettings(): Settings {
  const theme = (get("theme") as Settings["theme"]) ?? DEFAULTS.theme;
  return {
    hasGeminiApiKey: get("gemini_api_key") !== undefined,
    hasOpenaiApiKey: get("openai_api_key") !== undefined,
    hasAnthropicApiKey: get("anthropic_api_key") !== undefined,
    stage1Provider: (get("stage1_provider") as ProviderType) ?? DEFAULTS.stage1Provider,
    stage2Provider: (get("stage2_provider") as ProviderType) ?? DEFAULTS.stage2Provider,
    geminiModelStage1: get("gemini_model_stage1") ?? DEFAULTS.geminiModelStage1,
    geminiModelStage2: get("gemini_model_stage2") ?? DEFAULTS.geminiModelStage2,
    theme,
    autoMarkAsRead: (get("auto_mark_as_read") ?? "true") === "true",
  };
}

export interface SettingsUpdate {
  geminiApiKey?: string | null;
  openaiApiKey?: string | null;
  anthropicApiKey?: string | null;
  stage1Provider?: ProviderType;
  stage2Provider?: ProviderType;
  geminiModelStage1?: string;
  geminiModelStage2?: string;
  theme?: Settings["theme"];
  autoMarkAsRead?: boolean;
}

function updateApiKey(dbKey: string, value: string | null | undefined): void {
  if (value === undefined) return;
  if (value === null || value === "") {
    del(dbKey);
  } else {
    set(dbKey, encrypt(value));
  }
}

export function updateSettings(input: SettingsUpdate): Settings {
  const current = getSettings();
  const stage1 = resolveStageModel(
    current.stage1Provider,
    current.geminiModelStage1,
    input.stage1Provider,
    input.geminiModelStage1,
  );
  const stage2 = resolveStageModel(
    current.stage2Provider,
    current.geminiModelStage2,
    input.stage2Provider,
    input.geminiModelStage2,
  );

  updateApiKey("gemini_api_key", input.geminiApiKey);
  updateApiKey("openai_api_key", input.openaiApiKey);
  updateApiKey("anthropic_api_key", input.anthropicApiKey);
  set("stage1_provider", stage1.provider);
  set("stage2_provider", stage2.provider);
  set("gemini_model_stage1", stage1.model);
  set("gemini_model_stage2", stage2.model);
  if (input.theme) set("theme", input.theme);
  if (input.autoMarkAsRead !== undefined) {
    set("auto_mark_as_read", input.autoMarkAsRead ? "true" : "false");
  }
  return getSettings();
}

export function getDecryptedKey(key: string): string | null {
  const enc = get(key);
  if (!enc) return null;
  return decrypt(enc);
}

/** @deprecated Use getDecryptedKey("gemini_api_key") instead */
export function getDecryptedApiKey(): string | null {
  return getDecryptedKey("gemini_api_key");
}
