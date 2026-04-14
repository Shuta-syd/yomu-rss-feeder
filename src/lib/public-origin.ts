import { NextRequest } from "next/server";

/**
 * リバースプロキシ配下でも正しい公開オリジンを返す。
 * 優先順: APP_URL 環境変数 > x-forwarded-proto/host ヘッダ > req.url
 */
export function getPublicOrigin(req: NextRequest): string {
  const appUrl = process.env.APP_URL?.trim();
  if (appUrl) {
    try {
      return new URL(appUrl).origin;
    } catch {
      // fallthrough
    }
  }

  const forwardedHost = req.headers.get("x-forwarded-host");
  const host = forwardedHost ?? req.headers.get("host");
  if (host) {
    const forwardedProto = req.headers
      .get("x-forwarded-proto")
      ?.split(",")[0]
      ?.trim();
    const proto =
      forwardedProto ||
      (host.startsWith("localhost") || host.startsWith("127.")
        ? "http"
        : "https");
    return `${proto}://${host}`;
  }

  return new URL(req.url).origin;
}
