import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, jsonError } from "@/lib/api-helpers";
import { removeSubscription } from "@/lib/push";

const bodySchema = z.object({
  endpoint: z.string().url(),
});

export async function POST(req: NextRequest) {
  return withAuth(async () => {
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) return jsonError(400, "Invalid request");
    removeSubscription(parsed.data.endpoint);
    return NextResponse.json({ ok: true });
  });
}
