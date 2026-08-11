import { describe, it, expect } from "vitest";
import { STAGE1_SYSTEM, STAGE1_SYSTEM_JP, composeStage1System } from "@/lib/llm/prompts";

describe("composeStage1System", () => {
  it("lens が null なら base をそのまま返す", () => {
    expect(composeStage1System(STAGE1_SYSTEM, null)).toBe(STAGE1_SYSTEM);
  });

  it("lens が undefined なら base をそのまま返す", () => {
    expect(composeStage1System(STAGE1_SYSTEM_JP, undefined)).toBe(STAGE1_SYSTEM_JP);
  });

  it("lens が空白のみなら base をそのまま返す", () => {
    expect(composeStage1System(STAGE1_SYSTEM, "  \n ")).toBe(STAGE1_SYSTEM);
  });

  it("lens があれば base の後にフィード固有指示として追記される", () => {
    const lens = "summary は「誰が困り誰が払うか」の観点で要約する";
    const result = composeStage1System(STAGE1_SYSTEM, lens);
    expect(result.startsWith(STAGE1_SYSTEM)).toBe(true);
    expect(result).toContain(lens);
  });

  it("lens の指示が基本ルールより優先されることを明示する", () => {
    const result = composeStage1System(STAGE1_SYSTEM, "タグは以下から選ぶ: 終身サポート, 育成就労");
    expect(result).toContain("優先");
  });

  it("lens 前後の空白は取り除かれる", () => {
    const result = composeStage1System(STAGE1_SYSTEM, "  視点A  \n");
    expect(result).toContain("視点A");
    expect(result).not.toMatch(/視点A\s\s+/);
  });
});
