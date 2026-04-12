import { eq } from "drizzle-orm";
import { db } from "./db";
import { appConfig } from "./db/schema";
import { encrypt, decrypt } from "./crypto";

export interface Settings {
  hasGeminiApiKey: boolean;
  geminiModelStage1: string;
  geminiModelStage2: string;
  theme: "light" | "dark" | "system";
  autoMarkAsRead: boolean;
}

const DEFAULTS = {
  geminiModelStage1: "gemini-2.5-flash-lite",
  geminiModelStage2: "gemini-2.5-flash",
  theme: "system" as const,
  autoMarkAsRead: true,
};

export const AVAILABLE_MODELS = [
  "gemini-3-flash-preview",
  "gemini-2.5-flash-lite",
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
] as const;

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
    geminiModelStage1: get("gemini_model_stage1") ?? DEFAULTS.geminiModelStage1,
    geminiModelStage2: get("gemini_model_stage2") ?? DEFAULTS.geminiModelStage2,
    theme,
    autoMarkAsRead: (get("auto_mark_as_read") ?? "true") === "true",
  };
}

export interface SettingsUpdate {
  geminiApiKey?: string | null;
  geminiModelStage1?: string;
  geminiModelStage2?: string;
  theme?: Settings["theme"];
  autoMarkAsRead?: boolean;
}

export function updateSettings(input: SettingsUpdate): Settings {
  if (input.geminiApiKey !== undefined && input.geminiApiKey !== null) {
    if (input.geminiApiKey === "") {
      del("gemini_api_key");
    } else {
      set("gemini_api_key", encrypt(input.geminiApiKey));
    }
  }
  if (input.geminiModelStage1) set("gemini_model_stage1", input.geminiModelStage1);
  if (input.geminiModelStage2) set("gemini_model_stage2", input.geminiModelStage2);
  if (input.theme) set("theme", input.theme);
  if (input.autoMarkAsRead !== undefined) {
    set("auto_mark_as_read", input.autoMarkAsRead ? "true" : "false");
  }
  return getSettings();
}

export function getDecryptedApiKey(): string | null {
  const enc = get("gemini_api_key");
  if (!enc) return null;
  return decrypt(enc);
}
