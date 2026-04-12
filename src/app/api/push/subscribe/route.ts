import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, jsonError } from "@/lib/api-helpers";
import { saveSubscription } from "@/lib/push";

const bodySchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string(),
    auth: z.string(),
  }),
});

export async function POST(req: NextRequest) {
  return withAuth(async () => {
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) return jsonError(400, "Invalid subscription");
    const { endpoint, keys } = parsed.data;
    saveSubscription(endpoint, keys.p256dh, keys.auth);
    return NextResponse.json({ ok: true });
  });
}
