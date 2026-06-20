import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { fetchReadablePage } from "@/lib/rss/fullcontent";

const previousAllowPrivateFeedUrls = process.env.ALLOW_PRIVATE_FEED_URLS;
let server: Server | null = null;

afterEach(async () => {
  if (previousAllowPrivateFeedUrls === undefined) {
    delete process.env.ALLOW_PRIVATE_FEED_URLS;
  } else {
    process.env.ALLOW_PRIVATE_FEED_URLS = previousAllowPrivateFeedUrls;
  }
  if (!server) return;
  await new Promise<void>((resolve, reject) => {
    server?.close((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
  server = null;
});

function startHtmlServer(html: string): Promise<string> {
  server = createServer((_, res) => {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(html);
  });
  return new Promise((resolve) => {
    server!.listen(0, "127.0.0.1", () => {
      const address = server!.address();
      if (!address || typeof address === "string") throw new Error("No test server address");
      resolve(`http://127.0.0.1:${address.port}/post`);
    });
  });
}

describe("fetchReadablePage", () => {
  it("本文を抽出し、危険なHTMLを除去し、相対URLを絶対URLに変換する", async () => {
    process.env.ALLOW_PRIVATE_FEED_URLS = "true";
    const url = await startHtmlServer(`<!doctype html>
      <html>
        <head>
          <title>Doc Title</title>
          <meta property="og:title" content="Meta Title">
          <meta property="og:image" content="/og.png">
        </head>
        <body>
          <article>
            <h1>Readable Title</h1>
            <p>
              This article has enough readable text for extraction. It describes a market trend,
              a startup opportunity, and practical next steps in more than eighty characters.
            </p>
            <p><a href="/next">Next page</a></p>
            <img src="/hero.png" alt="Hero">
            <script>alert("xss")</script>
          </article>
        </body>
      </html>`);

    const page = await fetchReadablePage(url);

    expect(page).not.toBeNull();
    expect(page?.title).toBe("Meta Title");
    expect(page?.contentPlain).toContain("startup opportunity");
    expect(page?.contentHtml).not.toContain("<script");
    expect(page?.contentHtml).toContain(`href="${new URL("/next", url).toString()}"`);
    expect(page?.contentHtml).toContain(`src="${new URL("/hero.png", url).toString()}"`);
    expect(page?.thumbnailUrl).toBe(new URL("/og.png", url).toString());
  });
});
