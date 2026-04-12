import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { getSettings, updateSettings } from "@/lib/settings";

export async function GET() {
  try {
    await requireAuth();
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
  return NextResponse.json(getSettings());
}

const bodySchema = z.object({
  geminiApiKey: z.string().nullable().optional(),
  geminiModelStage1: z.string().optional(),
  geminiModelStage2: z.string().optional(),
  theme: z.enum(["light", "dark", "system"]).optional(),
  autoMarkAsRead: z.boolean().optional(),
});

export async function PUT(req: NextRequest) {
  try {
    await requireAuth();
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  return NextResponse.json(updateSettings(parsed.data));
}
