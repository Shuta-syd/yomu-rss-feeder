import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api-helpers";
import { disconnectX } from "@/lib/x/auth";

export async function POST() {
  return withAuth(async () => {
    disconnectX();
    return NextResponse.json({ ok: true });
  });
}
