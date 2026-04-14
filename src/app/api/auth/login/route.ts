import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  checkRateLimit,
  clientIpFromHeaders,
  issueSession,
  verifyCredentials,
} from "@/lib/auth";

const bodySchema = z.object({
  uid: z.string().regex(/^\d{10}$/),
  password: z.string().min(8).max(256),
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

  const ok = await verifyCredentials(parsed.data.uid, parsed.data.password);
  if (!ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await issueSession();
  return NextResponse.json({ ok: true });
}
