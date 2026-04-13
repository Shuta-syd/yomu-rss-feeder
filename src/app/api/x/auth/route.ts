import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-helpers";
import {
  getXClientId,
  generatePKCE,
  setPendingAuth,
  buildAuthUrl,
} from "@/lib/x/auth";

export async function GET(req: NextRequest) {
  return withAuth(async () => {
    const clientId = getXClientId();
    if (!clientId) {
      return NextResponse.json(
        { error: "X Client ID が設定されていません" },
        { status: 400 },
      );
    }

    const { codeVerifier, codeChallenge, state } = generatePKCE();
    setPendingAuth(state, codeVerifier);

    const origin = new URL(req.url).origin;
    const redirectUri = `${origin}/api/x/callback`;
    const authUrl = buildAuthUrl(clientId, redirectUri, codeChallenge, state);

    return NextResponse.redirect(authUrl);
  });
}
