import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  checkRateLimit,
  clientIpFromHeaders,
  issueSession,
  verifyPassword,
} from "@/lib/auth";

const bodySchema = z.object({
  password: z.string().min(1).max(256),
});

export async function POST(req: NextRequest) {
  try {
    checkRateLimit(`login:${clientIpFromHeaders(req.headers)}`, 5);
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const ok = await verifyPassword(parsed.data.password);
  if (!ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await issueSession();
  return NextResponse.json({ ok: true });
}
