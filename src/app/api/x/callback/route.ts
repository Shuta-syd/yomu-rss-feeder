import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import {
  getXClientId,
  getXClientSecret,
  getPendingAuth,
  clearPendingAuth,
  exchangeCode,
  setXAccessToken,
  setXRefreshToken,
} from "@/lib/x/auth";
import { getPublicOrigin } from "@/lib/public-origin";

export async function GET(req: NextRequest) {
  const origin = getPublicOrigin(req);

  // 認証チェック (cookieが付いている前提だが、なければ/loginへ)
  try {
    await requireAuth();
  } catch {
    return NextResponse.redirect(`${origin}/login`);
  }

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (!code || !state) {
    return NextResponse.json(
      { error: "code または state が不足しています" },
      { status: 400 },
    );
  }

  const pending = getPendingAuth();
  if (!pending || pending.state !== state) {
    return NextResponse.json(
      { error: "state が一致しません" },
      { status: 400 },
    );
  }

  const clientId = getXClientId();
  if (!clientId) {
    return NextResponse.json(
      { error: "X Client ID が設定されていません" },
      { status: 400 },
    );
  }

  try {
    const redirectUri = `${origin}/api/x/callback`;
    const { accessToken, refreshToken } = await exchangeCode(
      clientId,
      code,
      redirectUri,
      pending.codeVerifier,
      getXClientSecret(),
    );

    setXAccessToken(accessToken);
    setXRefreshToken(refreshToken);
    clearPendingAuth();

    return NextResponse.redirect(`${origin}/settings`);
  } catch (e) {
    clearPendingAuth();
    const message = e instanceof Error ? e.message : "Token exchange failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
