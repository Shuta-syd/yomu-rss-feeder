import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api-helpers";
import { getVapidPublicKey } from "@/lib/push";

export async function GET() {
  return withAuth(async () => {
    return NextResponse.json({ publicKey: getVapidPublicKey() });
  });
}
