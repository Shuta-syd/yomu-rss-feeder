import { describe, expect, it } from "vitest";
import { fetchSafeHttpUrl, UnsafeUrlError } from "@/lib/url-safety";

describe("fetchSafeHttpUrl", () => {
  it("http/https 以外を拒否する", async () => {
    await expect(fetchSafeHttpUrl("ftp://example.com/feed.xml")).rejects.toBeInstanceOf(
      UnsafeUrlError,
    );
  });

  it("URL credentials を拒否する", async () => {
    await expect(fetchSafeHttpUrl("https://user:pass@example.com/feed.xml")).rejects.toBeInstanceOf(
      UnsafeUrlError,
    );
  });

  it("loopback IPv4 を拒否する", async () => {
    await expect(fetchSafeHttpUrl("http://127.0.0.1/feed.xml")).rejects.toBeInstanceOf(
      UnsafeUrlError,
    );
  });

  it("private IPv4 を拒否する", async () => {
    await expect(fetchSafeHttpUrl("http://192.168.0.10/feed.xml")).rejects.toBeInstanceOf(
      UnsafeUrlError,
    );
  });

  it("loopback IPv6 を拒否する", async () => {
    await expect(fetchSafeHttpUrl("http://[::1]/feed.xml")).rejects.toBeInstanceOf(
      UnsafeUrlError,
    );
  });
});
