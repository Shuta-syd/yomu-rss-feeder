import { z } from "zod";

export const stage1Schema = z.object({
  titleJa: z.string().nullable().optional().default(null),
  summary: z.string(),
  tags: z.array(z.string()).max(3),
  detectedLanguage: z.string().max(5).optional(),
});

export const stage2Schema = z.object({
  summaryFull: z.string(),
  translation: z.string().nullable(),
  keyPoints: z.array(z.string()).max(10),
  relatedLinks: z.array(z.object({
    url: z.string(),
    title: z.string(),
  })).optional().default([]),
});

export type Stage1 = z.infer<typeof stage1Schema>;
export type Stage2 = z.infer<typeof stage2Schema>;

export class JsonParseError extends Error {
  constructor(
    public raw: string,
    public override cause: unknown,
  ) {
    super(`Failed to parse LLM JSON response: ${String(cause)}`);
  }
}

export class JsonValidationError extends Error {
  constructor(
    public raw: string,
    public zodError: z.ZodError,
  ) {
    super(`LLM JSON validation failed: ${zodError.message}`);
  }
}

function repair(raw: string): string {
  return raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/, "")
    .replace(/,(\s*})/g, "$1")
    .replace(/,(\s*])/g, "$1")
    .trim();
}

export function parseAndValidate<T>(raw: string, schema: z.ZodSchema<T>): T {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    try {
      parsed = JSON.parse(repair(raw));
    } catch (e) {
      throw new JsonParseError(raw, e);
    }
  }
  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new JsonValidationError(raw, result.error);
  }
  return result.data;
}
