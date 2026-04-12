import { describe, it, expect } from "vitest";
import { sanitizeHtml, htmlToPlain } from "@/lib/sanitize";

describe("sanitizeHtml", () => {
  it("<script>を除去", () => {
    const dirty = "<p>hello</p><script>alert('xss')</script>";
    const clean = sanitizeHtml(dirty);
    expect(clean).not.toContain("<script");
    expect(clean).not.toContain("alert");
    expect(clean).toContain("<p>hello</p>");
  });

  it("onerror属性を除去", () => {
    const dirty = '<img src="x" onerror="alert(1)">';
    const clean = sanitizeHtml(dirty);
    expect(clean).not.toContain("onerror");
  });

  it("<iframe>を除去", () => {
    const dirty = '<iframe src="https://evil.com"></iframe><p>ok</p>';
    const clean = sanitizeHtml(dirty);
    expect(clean).not.toContain("iframe");
    expect(clean).toContain("<p>ok</p>");
  });

  it("aタグに target=_blank と rel=noopener noreferrer を付与", () => {
    const dirty = '<a href="https://example.com">link</a>';
    const clean = sanitizeHtml(dirty);
    expect(clean).toContain('target="_blank"');
    expect(clean).toContain("noopener");
    expect(clean).toContain("noreferrer");
  });

  it("imgに loading=lazy と referrerpolicy=no-referrer を付与", () => {
    const dirty = '<img src="https://example.com/a.png" alt="a">';
    const clean = sanitizeHtml(dirty);
    expect(clean).toContain('loading="lazy"');
    expect(clean).toContain('referrerpolicy="no-referrer"');
  });

  it("javascript: URLを除去", () => {
    const dirty = '<a href="javascript:alert(1)">x</a>';
    const clean = sanitizeHtml(dirty);
    expect(clean).not.toContain("javascript:");
  });

  it("許可タグを保持: p, strong, ul, li, code, pre, blockquote", () => {
    const dirty =
      "<p><strong>b</strong></p><ul><li>x</li></ul><pre><code>c</code></pre><blockquote>q</blockquote>";
    const clean = sanitizeHtml(dirty);
    expect(clean).toContain("<strong>b</strong>");
    expect(clean).toContain("<li>x</li>");
    expect(clean).toContain("<code>c</code>");
    expect(clean).toContain("<blockquote>q</blockquote>");
  });
});

describe("htmlToPlain", () => {
  it("タグを除去しテキストだけ抽出", () => {
    expect(htmlToPlain("<p>Hello <strong>world</strong></p>")).toBe("Hello world");
  });
  it("複数空白を1つに圧縮", () => {
    expect(htmlToPlain("<p>a   b\n\nc</p>")).toBe("a b c");
  });
});
