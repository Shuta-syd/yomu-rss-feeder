import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  parseAndValidate,
  stage1Schema,
  stage2Schema,
  JsonParseError,
  JsonValidationError,
} from "@/lib/llm/parse-response";

describe("parseAndValidate", () => {
  it("正常なJSONをパース", () => {
    const raw = JSON.stringify({ summary: "short", tags: ["AI"] });
    const result = parseAndValidate(raw, stage1Schema);
    expect(result.summary).toBe("short");
    expect(result.tags).toEqual(["AI"]);
  });

  it("```json コードブロックを剥がす", () => {
    const raw = "```json\n" + JSON.stringify({ summary: "x", tags: [] }) + "\n```";
    const result = parseAndValidate(raw, stage1Schema);
    expect(result.summary).toBe("x");
  });

  it("```  コードブロック (json なし) も剥がす", () => {
    const raw = "```\n" + JSON.stringify({ summary: "x", tags: [] }) + "\n```";
    const result = parseAndValidate(raw, stage1Schema);
    expect(result.summary).toBe("x");
  });

  it("trailing comma を修復", () => {
    const raw = '{"summary": "x", "tags": ["a",],}';
    const result = parseAndValidate(raw, stage1Schema);
    expect(result.tags).toEqual(["a"]);
  });

  it("修復不能なJSONは JsonParseError", () => {
    expect(() => parseAndValidate("not json at all", stage1Schema)).toThrow(
      JsonParseError,
    );
  });

  it("スキーマ違反は JsonValidationError", () => {
    const raw = JSON.stringify({ summary: 123, tags: "not-array" });
    expect(() => parseAndValidate(raw, stage1Schema)).toThrow(JsonValidationError);
  });

  it("tags は最大3要素制約", () => {
    const raw = JSON.stringify({
      summary: "x",
      tags: ["a", "b", "c", "d"],
    });
    expect(() => parseAndValidate(raw, stage1Schema)).toThrow(JsonValidationError);
  });

  it("stage2: translation は null 可", () => {
    const raw = JSON.stringify({
      summaryFull: "full",
      translation: null,
      keyPoints: ["a", "b"],
    });
    const result = parseAndValidate(raw, stage2Schema);
    expect(result.translation).toBeNull();
  });

  it("任意スキーマでも動く", () => {
    const schema = z.object({ x: z.number() });
    expect(parseAndValidate('{"x": 1}', schema)).toEqual({ x: 1 });
  });
});
