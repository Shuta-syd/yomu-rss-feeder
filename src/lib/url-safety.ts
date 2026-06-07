import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const MAX_REDIRECTS = 5;

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
  }
}

function privateFeedUrlsAllowed(): boolean {
  return process.env.ALLOW_PRIVATE_FEED_URLS === "true";
}

function isPrivateIpv4(address: string): boolean {
  const parts = address.split(".").map((x) => Number.parseInt(x, 10));
  if (parts.length !== 4 || parts.some((x) => !Number.isInteger(x) || x < 0 || x > 255)) {
    return true;
  }
  const [a, b] = parts as [number, number, number, number];
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function isPrivateIpv6(address: string): boolean {
  const normalized = address.toLowerCase();
  if (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb")
  ) {
    return true;
  }
  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  return mapped ? isPrivateIpv4(mapped[1]!) : false;
}

function isPrivateAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return isPrivateIpv4(address);
  if (family === 6) return isPrivateIpv6(address);
  return true;
}

async function assertSafeHttpUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new UnsafeUrlError("Invalid URL");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UnsafeUrlError("Only http and https URLs are allowed");
  }
  if (url.username || url.password) {
    throw new UnsafeUrlError("URL credentials are not allowed");
  }
  if (privateFeedUrlsAllowed()) return url;

  const hostname = url.hostname.replace(/^\[(.*)\]$/, "$1");
  const literalFamily = isIP(hostname);
  const addresses = literalFamily
    ? [hostname]
    : await lookup(hostname, { all: true })
        .then((entries) => entries.map((entry) => entry.address))
        .catch(() => {
          throw new UnsafeUrlError("Host could not be resolved");
        });

  if (addresses.length === 0 || addresses.some(isPrivateAddress)) {
    throw new UnsafeUrlError("Private, local, or reserved network addresses are not allowed");
  }
  return url;
}

export async function fetchSafeHttpUrl(
  rawUrl: string,
  init: RequestInit = {},
): Promise<{ response: Response; url: string }> {
  let current = (await assertSafeHttpUrl(rawUrl)).toString();

  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
    const response = await fetch(current, { ...init, redirect: "manual" });
    if (response.status < 300 || response.status >= 400) {
      return { response, url: current };
    }

    const location = response.headers.get("location");
    if (!location) return { response, url: current };

    current = (await assertSafeHttpUrl(new URL(location, current).toString())).toString();
  }

  throw new UnsafeUrlError("Too many redirects");
}
