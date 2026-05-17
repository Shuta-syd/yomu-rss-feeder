import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "./db";
import { articles, feeds } from "./db/schema";

const bodySchema = z
  .object({
    feedId: z.string().optional(),
    category: z.string().optional(),
  })
  .partial();

export type MarkAllReadScope =
  | { kind: "all" }
  | { kind: "feed"; feedId: string }
  | { kind: "category"; category: string };

export type ValidateResult =
  | { ok: true; scope: MarkAllReadScope }
  | { ok: false; error: string };

export function validateMarkAllReadInput(input: unknown): ValidateResult {
  const parsed = bodySchema.safeParse(input ?? {});
  if (!parsed.success) {
    return { ok: false, error: "Invalid request" };
  }
  const feedId = parsed.data.feedId?.trim();
  const category = parsed.data.category?.trim();
  if (feedId && category) {
    return { ok: false, error: "feedId と category は同時指定できません" };
  }
  if (feedId) return { ok: true, scope: { kind: "feed", feedId } };
  if (category) return { ok: true, scope: { kind: "category", category } };
  return { ok: true, scope: { kind: "all" } };
}

export function markAllRead(scope: MarkAllReadScope): number {
  const now = Date.now();
  const baseWhere = eq(articles.isRead, false);

  if (scope.kind === "feed") {
    return db
      .update(articles)
      .set({ isRead: true, readAt: now })
      .where(and(eq(articles.feedId, scope.feedId), baseWhere))
      .run().changes;
  }
  if (scope.kind === "category") {
    const feedIdSubquery = db
      .select({ id: feeds.id })
      .from(feeds)
      .where(eq(feeds.category, scope.category));
    return db
      .update(articles)
      .set({ isRead: true, readAt: now })
      .where(and(inArray(articles.feedId, feedIdSubquery), baseWhere))
      .run().changes;
  }
  return db
    .update(articles)
    .set({ isRead: true, readAt: now })
    .where(baseWhere)
    .run().changes;
}
