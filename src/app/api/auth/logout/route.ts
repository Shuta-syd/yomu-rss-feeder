import { NextResponse } from "next/server";
import { destroySession, requireAuth } from "@/lib/auth";

export async function POST() {
  try {
    await requireAuth();
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
  await destroySession();
  return NextResponse.json({ ok: true });
}
