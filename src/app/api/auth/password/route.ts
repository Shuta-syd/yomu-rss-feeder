import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { changePassword, checkRateLimit, clientIpFromHeaders } from "@/lib/auth";
import { withAuth, jsonError } from "@/lib/api-helpers";

const bodySchema = z.object({
  currentPassword: z.string().min(1).max(256),
  newPassword: z.string().min(8).max(256),
});

export async function PUT(req: NextRequest) {
  return withAuth(async () => {
    try {
      checkRateLimit(`password:${clientIpFromHeaders(req.headers)}`, 5);
    } catch (e) {
      if (e instanceof Response) return e;
      throw e;
    }

    const json = await req.json().catch(() => null);
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) return jsonError(400, "Invalid request");

    const ok = await changePassword(parsed.data.currentPassword, parsed.data.newPassword);
    if (!ok) return jsonError(401, "Current password incorrect");

    return NextResponse.json({ ok: true });
  });
}
