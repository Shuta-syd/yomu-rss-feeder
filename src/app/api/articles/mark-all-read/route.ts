import { NextRequest, NextResponse } from "next/server";
import { withAuth, jsonError } from "@/lib/api-helpers";
import { validateMarkAllReadInput, markAllRead } from "@/lib/mark-all-read";

export async function POST(req: NextRequest) {
  return withAuth(async () => {
    const json = await req.json().catch(() => ({}));
    const result = validateMarkAllReadInput(json);
    if (!result.ok) return jsonError(400, result.error);
    const updated = markAllRead(result.scope);
    return NextResponse.json({ updated });
  });
}
