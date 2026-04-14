import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api-helpers";
import { isXConnected, getXClientId, hasXClientSecret } from "@/lib/x/auth";

export async function GET() {
  return withAuth(async () => {
    return NextResponse.json({
      connected: isXConnected(),
      hasClientId: !!getXClientId(),
      hasClientSecret: hasXClientSecret(),
    });
  });
}
