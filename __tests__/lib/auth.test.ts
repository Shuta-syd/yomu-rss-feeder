import { describe, it, expect, beforeEach, vi } from "vitest";

// DB と next/headers をスタブ化 (副作用を避けて純粋関数だけテストする)
vi.mock("@/lib/db", () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ get: () => undefined }) }) }),
    insert: () => ({
      values: () => ({ onConflictDoUpdate: () => ({ run: () => {} }) }),
    }),
    delete: () => ({ where: () => ({ run: () => {} }) }),
  },
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => {} }),
}));

import {
  hashToken,
  checkRateLimit,
  _resetRateLimitForTest,
  clientIpFromHeaders,
  generateUid,
} from "@/lib/auth";

describe("hashToken", () => {
  it("決定的: 同じ入力に対し同じ出力 (SHA-256 64hex)", () => {
    const a = hashToken("abc");
    const b = hashToken("abc");
    expect(a).toBe(b);
    expect(a).toHaveLength(64);
  });
  it("異なる入力で異なるハッシュ", () => {
    expect(hashToken("a")).not.toBe(hashToken("b"));
  });
});

describe("checkRateLimit", () => {
  beforeEach(() => _resetRateLimitForTest());

  it("5回までは通る", () => {
    for (let i = 0; i < 5; i++) {
      expect(() => checkRateLimit("login:1.1.1.1", 5)).not.toThrow();
    }
  });

  it("6回目は 429 Response throw", () => {
    for (let i = 0; i < 5; i++) checkRateLimit("login:1.1.1.1", 5);
    let thrown: unknown;
    try {
      checkRateLimit("login:1.1.1.1", 5);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(Response);
    expect((thrown as Response).status).toBe(429);
  });

  it("異なるキーは独立してカウント", () => {
    for (let i = 0; i < 5; i++) checkRateLimit("login:a", 5);
    expect(() => checkRateLimit("login:b", 5)).not.toThrow();
  });
});

describe("generateUid", () => {
  it("10桁の数字を返す", () => {
    const uid = generateUid();
    expect(uid).toMatch(/^\d{10}$/);
  });
  it("先頭が0でない", () => {
    for (let i = 0; i < 50; i++) {
      expect(generateUid()[0]).not.toBe("0");
    }
  });
  it("複数回呼んで異なるUIDが返る (衝突確率は極めて低い)", () => {
    const set = new Set<string>();
    for (let i = 0; i < 20; i++) set.add(generateUid());
    expect(set.size).toBe(20);
  });
});

describe("clientIpFromHeaders", () => {
  it("X-Forwarded-For の先頭を使う", () => {
    const h = new Headers({ "x-forwarded-for": "1.1.1.1, 2.2.2.2" });
    expect(clientIpFromHeaders(h)).toBe("1.1.1.1");
  });
  it("X-Real-IP フォールバック", () => {
    const h = new Headers({ "x-real-ip": "3.3.3.3" });
    expect(clientIpFromHeaders(h)).toBe("3.3.3.3");
  });
  it("なければ unknown", () => {
    expect(clientIpFromHeaders(new Headers())).toBe("unknown");
  });
});
