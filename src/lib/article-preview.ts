import { classificationGroups } from "./article-classification";

const knownTags = new Set(classificationGroups.flatMap(group => group.values.map(value => `${group.label}:${value}`)));

/** Only display saved classification labels, never infer new labels while rendering. */
export function previewTags(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const tags = [...new Set(parsed.filter((tag): tag is string => typeof tag === "string" && knownTags.has(tag)))];
    const specific = tags.filter(tag => !tag.startsWith("ジャンル:"));
    return specific.length ? specific : tags;
  } catch {
    return [];
  }
}

export function previewText(value: string | null): string {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}
