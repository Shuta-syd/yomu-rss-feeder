import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { randomBytes, createHash, randomInt, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { appConfig } from "./db/schema";

export const SESSION_COOKIE = "yomu_session";
export const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 30;

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function getConfig(key: string): string | undefined {
  const row = db.select().from(appConfig).where(eq(appConfig.key, key)).get();
  return row?.value;
}

function setConfig(key: string, value: string): void {
  db.insert(appConfig)
    .values({ key, value })
    .onConflictDoUpdate({ target: appConfig.key, set: { value } })
    .run();
}

function deleteConfig(key: string): void {
  db.delete(appConfig).where(eq(appConfig.key, key)).run();
}

export function isSetupCompleted(): boolean {
  return getConfig("setup_completed") === "true";
}

export function generateUid(): string {
  // 10桁、先頭は1-9 (0だと見た目8桁になる)
  const first = randomInt(1, 10);
  let rest = "";
  for (let i = 0; i < 9; i++) rest += randomInt(0, 10);
  return `${first}${rest}`;
}

export function getUid(): string | null {
  return getConfig("uid") ?? null;
}

export async function completeSetup(password: string): Promise<{ uid: string }> {
  if (isSetupCompleted()) {
    throw new Response("Setup already completed", { status: 409 });
  }
  const hash = await bcrypt.hash(password, 12);
  const uid = generateUid();
  setConfig("password_hash", hash);
  setConfig("uid", uid);
  setConfig("setup_completed", "true");
  return { uid };
}

function safeEqualString(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export async function verifyCredentials(uid: string, password: string): Promise<boolean> {
  const storedUid = getConfig("uid");
  const storedHash = getConfig("password_hash");
  // UIDが不一致でも bcrypt.compare を実行し、タイミング差を抑える
  const dummyHash = "$2a$12$CwTycUXWue0Thq9StjUM0uJ8B8h0kq9lC4z7Lq7HkYyXqP6V.dGXa";
  const uidOk = storedUid != null && safeEqualString(uid, storedUid);
  const passwordOk = await bcrypt.compare(password, storedHash ?? dummyHash);
  return Boolean(uidOk && passwordOk && storedHash);
}

export async function issueSession(): Promise<void> {
  const token = randomBytes(32).toString("hex");
  const tokenHash = hashToken(token);
  const expiresAt = Date.now() + SESSION_MAX_AGE_SEC * 1000;

  setConfig("session_hash", tokenHash);
  setConfig("session_expires_at", String(expiresAt));

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: SESSION_MAX_AGE_SEC,
    path: "/",
  });
}

export async function destroySession(): Promise<void> {
  deleteConfig("session_hash");
  deleteConfig("session_expires_at");
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 0,
    path: "/",
  });
}

export async function requireAuth(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) throw new Response("Unauthorized", { status: 401 });

  const storedHash = getConfig("session_hash");
  if (!storedHash || storedHash !== hashToken(token)) {
    throw new Response("Unauthorized", { status: 401 });
  }
  const expiresRaw = getConfig("session_expires_at");
  if (expiresRaw && Number(expiresRaw) < Date.now()) {
    throw new Response("Session expired", { status: 401 });
  }
}

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(key: string, maxPerMinute = 5): void {
  const now = Date.now();
  const entry = rateLimitMap.get(key);
  if (!entry || entry.resetAt < now) {
    rateLimitMap.set(key, { count: 1, resetAt: now + 60_000 });
    return;
  }
  entry.count++;
  if (entry.count > maxPerMinute) {
    throw new Response("Too many requests", { status: 429 });
  }
}

export function _resetRateLimitForTest(): void {
  rateLimitMap.clear();
}

export function clientIpFromHeaders(headers: Headers): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return headers.get("x-real-ip") ?? "unknown";
}
