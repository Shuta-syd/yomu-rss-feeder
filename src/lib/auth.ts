import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { randomBytes, createHash } from "node:crypto";
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

export async function completeSetup(password: string): Promise<void> {
  if (isSetupCompleted()) {
    throw new Response("Setup already completed", { status: 409 });
  }
  const hash = await bcrypt.hash(password, 12);
  setConfig("password_hash", hash);
  setConfig("setup_completed", "true");
}

export async function verifyPassword(password: string): Promise<boolean> {
  const stored = getConfig("password_hash");
  if (!stored) return false;
  return bcrypt.compare(password, stored);
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
