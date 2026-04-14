import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  checkRateLimit,
  clientIpFromHeaders,
  completeSetup,
  isSetupCompleted,
} from "@/lib/auth";

export async function GET() {
  return NextResponse.json({ completed: isSetupCompleted() });
}

const bodySchema = z.object({
  password: z.string().min(8).max(256),
});

export async function POST(req: NextRequest) {
  try {
    checkRateLimit(`setup:${clientIpFromHeaders(req.headers)}`, 5);
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }

  if (isSetupCompleted()) {
    return NextResponse.json({ error: "Setup already completed" }, { status: 409 });
  }

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  let uid: string;
  try {
    const result = await completeSetup(parsed.data.password);
    uid = result.uid;
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }

  return NextResponse.json({ ok: true, uid });
}
