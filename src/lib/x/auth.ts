import { encrypt, decrypt } from "../crypto";
import { db } from "../db";
import { appConfig } from "../db/schema";
import { eq } from "drizzle-orm";
import { randomBytes, createHash } from "node:crypto";

// app_config KVヘルパー
function get(key: string): string | undefined {
  return db.select().from(appConfig).where(eq(appConfig.key, key)).get()?.value;
}
function set(key: string, value: string): void {
  db.insert(appConfig)
    .values({ key, value })
    .onConflictDoUpdate({ target: appConfig.key, set: { value } })
    .run();
}
function del(key: string): void {
  db.delete(appConfig).where(eq(appConfig.key, key)).run();
}

export function getXClientId(): string | null {
  return get("x_client_id") ?? null;
}
export function setXClientId(id: string): void {
  set("x_client_id", id);
}

export function getXAccessToken(): string | null {
  const enc = get("x_access_token");
  return enc ? decrypt(enc) : null;
}
export function setXAccessToken(token: string): void {
  set("x_access_token", encrypt(token));
}

export function getXRefreshToken(): string | null {
  const enc = get("x_refresh_token");
  return enc ? decrypt(enc) : null;
}
export function setXRefreshToken(token: string): void {
  set("x_refresh_token", encrypt(token));
}

export function isXConnected(): boolean {
  return !!getXAccessToken();
}

export function disconnectX(): void {
  del("x_access_token");
  del("x_refresh_token");
}

export function generatePKCE(): {
  codeVerifier: string;
  codeChallenge: string;
  state: string;
} {
  const codeVerifier = randomBytes(32).toString("base64url");
  const codeChallenge = createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");
  const state = randomBytes(16).toString("hex");
  return { codeVerifier, codeChallenge, state };
}

// PKCE state/verifierの一時保存 (インプロセス、シングルユーザーなので問題なし)
let pendingAuth: { state: string; codeVerifier: string } | null = null;
export function setPendingAuth(state: string, codeVerifier: string): void {
  pendingAuth = { state, codeVerifier };
}
export function getPendingAuth(): {
  state: string;
  codeVerifier: string;
} | null {
  return pendingAuth;
}
export function clearPendingAuth(): void {
  pendingAuth = null;
}

export function buildAuthUrl(
  clientId: string,
  redirectUri: string,
  codeChallenge: string,
  state: string,
): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: "like.read users.read tweet.read offline.access",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });
  return `https://x.com/i/oauth2/authorize?${params}`;
}

export async function exchangeCode(
  clientId: string,
  code: string,
  redirectUri: string,
  codeVerifier: string,
): Promise<{ accessToken: string; refreshToken: string }> {
  const res = await fetch("https://api.x.com/2/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId,
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    }),
  });
  if (!res.ok)
    throw new Error(
      `X token exchange failed: ${res.status} ${await res.text()}`,
    );
  const data = await res.json();
  return { accessToken: data.access_token, refreshToken: data.refresh_token };
}
