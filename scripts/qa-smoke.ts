export {};

const baseUrlValue = process.env.YOMU_QA_BASE_URL ?? "";
const uid = process.env.YOMU_QA_UID ?? "";
const password = process.env.YOMU_QA_PASSWORD ?? "";

if (!baseUrlValue || !/^\d{10}$/.test(uid) || password.length < 8) {
  throw new Error("Local QA credentials are incomplete. Check .env.qa.local.");
}

const baseUrl = new URL(baseUrlValue);
if (
  baseUrl.protocol !== "http:" ||
  baseUrl.hostname !== "127.0.0.1" ||
  baseUrl.username ||
  baseUrl.password
) {
  throw new Error("YOMU_QA_BASE_URL must use local HTTP on 127.0.0.1.");
}

const loginResponse = await fetch(new URL("/api/auth/login", baseUrl), {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ uid, password }),
});
if (!loginResponse.ok) {
  throw new Error(`Local QA login failed with HTTP ${loginResponse.status}.`);
}

const sessionCookie = loginResponse.headers.get("set-cookie")?.split(";", 1)[0];
if (!sessionCookie) {
  throw new Error("Local QA login did not return a session cookie.");
}

const feedsResponse = await fetch(new URL("/api/feeds", baseUrl), {
  headers: { Cookie: sessionCookie },
});
if (!feedsResponse.ok) {
  throw new Error(`Authenticated feeds request failed with HTTP ${feedsResponse.status}.`);
}

const data = await feedsResponse.json() as { feeds?: unknown[] };
console.log(
  `[yomu] Local QA smoke passed: login=200, feeds=200, feedCount=${data.feeds?.length ?? 0}`,
);
