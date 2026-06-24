import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { v7 as uuidv7 } from "uuid";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { savedSites } from "@/lib/db/schema";
import { withAuth, jsonError } from "@/lib/api-helpers";

const siteSchema = z.object({
  url: z.string().url().max(2048),
  title: z.string().trim().min(1).max(200).optional(),
  category: z.string().trim().min(1).max(64).optional(),
});

function normalizeSiteUrl(input: string): string | null {
  try {
    const url = new URL(input.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function deriveTitle(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "") || url;
  } catch {
    return url;
  }
}

function resolveFaviconUrl(url: string): string | null {
  try {
    const hostname = new URL(url).hostname;
    return `https://www.google.com/s2/favicons?domain=${hostname}&sz=64`;
  } catch {
    return null;
  }
}

export async function GET() {
  return withAuth(async () => {
    const rows = db
      .select()
      .from(savedSites)
      .orderBy(asc(savedSites.createdAt))
      .all();
    return NextResponse.json({ sites: rows });
  });
}

export async function POST(req: NextRequest) {
  return withAuth(async () => {
    const json = await req.json().catch(() => null);
    const parsed = siteSchema.safeParse(json);
    if (!parsed.success) return jsonError(400, "Invalid request");

    const url = normalizeSiteUrl(parsed.data.url);
    if (!url) return jsonError(400, "Invalid URL");

    const existing = db.select().from(savedSites).where(eq(savedSites.url, url)).get();
    if (existing) return jsonError(409, "Site already exists");

    const id = uuidv7();
    db.insert(savedSites)
      .values({
        id,
        title: parsed.data.title ?? deriveTitle(url),
        url,
        category: parsed.data.category ?? "未分類",
        faviconUrl: resolveFaviconUrl(url),
      })
      .run();

    const row = db.select().from(savedSites).where(eq(savedSites.id, id)).get();
    return NextResponse.json(row, { status: 201 });
  });
}
