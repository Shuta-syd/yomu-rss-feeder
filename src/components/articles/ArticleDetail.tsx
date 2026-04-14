"use client";

import type { ArticleDTO } from "@/types/article";
import { useEffect, useState, useCallback } from "react";

interface Props {
  article: ArticleDTO | null;
  onChange: (a: ArticleDTO) => void;
}

interface RelatedLink {
  url: string;
  title: string;
}

export function ArticleDetail({ article, onChange }: Props) {
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [streamText, setStreamText] = useState("");
  const [showTranslation, setShowTranslation] = useState(false);

  useEffect(() => {
    setAiError(null);
    setAiLoading(false);
    setStreamText("");
    // 記事切替時、翻訳があればデフォルトで日本語表示
    setShowTranslation(!!article?.aiTranslation);
  }, [article?.id, article?.aiTranslation]);

  const runAi = useCallback(async () => {
    if (!article) return;
    setAiLoading(true);
    setAiError(null);
    setStreamText("");

    try {
      const res = await fetch(`/api/articles/${article.id}/ai`, { method: "POST" });

      if (!res.ok) {
        setAiError("AI 処理に失敗しました");
        setAiLoading(false);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        setAiError("ストリーム取得失敗");
        setAiLoading(false);
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const jsonStr = line.slice(6);
            try {
              const data = JSON.parse(jsonStr);
              if (data.text) {
                setStreamText((prev) => prev + data.text);
              }
              if (data.id) {
                // done event — full article DTO
                onChange(data as ArticleDTO);
                setStreamText("");
              }
              if (data.message && !data.id) {
                // error event
                setAiError(data.message);
              }
            } catch {
              // skip
            }
          }
        }
      }
    } catch {
      setAiError("接続エラー");
    } finally {
      setAiLoading(false);
    }
  }, [article, onChange]);

  if (!article) {
    return (
      <div
        className="flex h-full items-center justify-center text-sm"
        style={{ color: "var(--muted)" }}
      >
        記事を選択してください
      </div>
    );
  }

  async function toggle(field: "isRead" | "isStarred", value: boolean) {
    if (!article) return;
    const res = await fetch(`/api/articles/${article.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });
    if (res.ok) onChange(await res.json());
  }

  const tags: string[] = article.aiTags ? JSON.parse(article.aiTags) : [];
  const keyPoints: string[] = article.aiKeyPoints ? JSON.parse(article.aiKeyPoints) : [];
  const relatedLinks: RelatedLink[] = article.aiRelatedLinks
    ? JSON.parse(article.aiRelatedLinks)
    : [];

  return (
    <article className="h-full overflow-y-auto">
      {/* ヘッダー */}
      <header
        className="sticky top-0 z-10 border-b px-6 py-4"
        style={{ background: "var(--bg)", borderColor: "var(--card-border)" }}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-bold leading-snug">
              {article.aiTitleJa ?? article.title}
            </h1>
            {article.aiTitleJa && (
              <p className="mt-0.5 text-xs" style={{ color: "var(--muted)" }}>
                {article.title}
              </p>
            )}
            <div
              className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs"
              style={{ color: "var(--muted)" }}
            >
              {article.author && <span>{article.author}</span>}
              {article.publishedAt && (
                <time>{new Date(article.publishedAt).toLocaleString("ja-JP")}</time>
              )}
              <a
                href={article.url}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 transition-colors hover:opacity-80"
                style={{ color: "var(--accent)" }}
              >
                元記事を開く
              </a>
            </div>
          </div>
          <div className="flex shrink-0 gap-1.5">
            <button
              onClick={() => toggle("isStarred", !article.isStarred)}
              className="rounded-md px-2.5 py-1.5 text-sm transition-colors"
              style={{ background: "var(--card)", border: "1px solid var(--card-border)" }}
              title={article.isStarred ? "スター解除" : "スター"}
            >
              {article.isStarred ? "★" : "☆"}
            </button>
            <button
              onClick={() => toggle("isRead", !article.isRead)}
              className="rounded-md px-2.5 py-1.5 text-xs transition-colors"
              style={{ background: "var(--card)", border: "1px solid var(--card-border)" }}
            >
              {article.isRead ? "未読に戻す" : "既読にする"}
            </button>
          </div>
        </div>
        {tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {tags.map((t) => (
              <span
                key={t}
                className="rounded-full px-2.5 py-0.5 text-xs font-medium"
                style={{ background: "var(--accent-subtle)", color: "var(--accent)" }}
              >
                {t}
              </span>
            ))}
          </div>
        )}
        {article.aiSummaryShort && (
          <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
            {article.aiSummaryShort}
          </p>
        )}
      </header>

      <div className="mx-auto max-w-3xl px-6 py-6">
        {/* AI 要約・翻訳パネル */}
        <section
          className="mb-8 rounded-lg border p-5"
          style={{ background: "var(--ai-bg)", borderColor: "var(--ai-border)" }}
        >
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-bold" style={{ color: "var(--accent)" }}>
              AI 要約・翻訳
            </h2>
            <button
              onClick={runAi}
              disabled={aiLoading || article.aiStage2Status === "processing"}
              className="rounded-md px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50"
              style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
            >
              {aiLoading ? "処理中..." : article.aiSummaryFull ? "再生成" : "生成"}
            </button>
          </div>

          {aiError && <p className="mb-2 text-sm text-red-500">{aiError}</p>}

          {/* ストリーミング中の表示 */}
          {aiLoading && streamText && (
            <div className="text-sm leading-relaxed whitespace-pre-wrap break-all opacity-70">
              {streamText}
              <span className="ml-1 inline-block h-4 w-1 animate-pulse" style={{ background: "var(--accent)" }} />
            </div>
          )}

          {/* 完了後の表示 */}
          {!aiLoading && article.aiSummaryFull && (
            <div className="space-y-4">
              <div>
                <h3 className="mb-1.5 text-xs font-semibold" style={{ color: "var(--muted)" }}>
                  要約
                </h3>
                <p className="text-sm leading-relaxed">{article.aiSummaryFull}</p>
              </div>

              {keyPoints.length > 0 && (
                <div>
                  <h3 className="mb-1.5 text-xs font-semibold" style={{ color: "var(--muted)" }}>
                    キーポイント
                  </h3>
                  <ul className="list-inside list-disc space-y-1 text-sm leading-relaxed">
                    {keyPoints.map((p, i) => (
                      <li key={i}>{p}</li>
                    ))}
                  </ul>
                </div>
              )}

              {relatedLinks.length > 0 && (
                <div>
                  <h3 className="mb-1.5 text-xs font-semibold" style={{ color: "var(--muted)" }}>
                    関連リンク
                  </h3>
                  <ul className="space-y-1">
                    {relatedLinks.map((link, i) => (
                      <li key={i} className="text-sm">
                        <a
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline underline-offset-2"
                          style={{ color: "var(--accent)" }}
                        >
                          {link.title}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {!article.aiSummaryFull && !aiLoading && (
            <p className="text-xs" style={{ color: "var(--muted)" }}>
              「生成」ボタンで要約・翻訳を作成できます
            </p>
          )}
        </section>

        {/* 記事本文 */}
        {article.contentHtml ? (
          <>
            {article.aiTranslation && (
              <div
                className="mb-4 inline-flex rounded-md border text-xs"
                style={{ borderColor: "var(--card-border)" }}
              >
                <button
                  onClick={() => setShowTranslation(false)}
                  className="px-3 py-1.5"
                  style={{
                    background: showTranslation ? "transparent" : "var(--accent-subtle)",
                    color: showTranslation ? "var(--muted)" : "var(--accent)",
                    fontWeight: showTranslation ? "normal" : 600,
                  }}
                >
                  原文
                </button>
                <button
                  onClick={() => setShowTranslation(true)}
                  className="px-3 py-1.5"
                  style={{
                    background: showTranslation ? "var(--accent-subtle)" : "transparent",
                    color: showTranslation ? "var(--accent)" : "var(--muted)",
                    fontWeight: showTranslation ? 600 : "normal",
                    borderLeft: "1px solid var(--card-border)",
                  }}
                >
                  日本語
                </button>
              </div>
            )}
            {showTranslation && article.aiTranslation ? (
              <div
                className="prose prose-neutral max-w-none dark:prose-invert
                  prose-headings:font-bold prose-headings:tracking-tight
                  prose-h1:text-xl prose-h2:text-lg prose-h3:text-base
                  prose-p:leading-7 prose-p:text-[15px]
                  prose-a:underline prose-a:underline-offset-2
                  prose-img:rounded-lg prose-img:shadow-sm
                  prose-pre:rounded-lg prose-pre:text-sm
                  prose-code:text-sm prose-code:before:content-none prose-code:after:content-none
                  prose-blockquote:border-l-2 prose-blockquote:not-italic
                  prose-li:leading-7"
                style={
                  {
                    "--tw-prose-body": "var(--fg)",
                    "--tw-prose-headings": "var(--fg)",
                    "--tw-prose-links": "var(--accent)",
                    "--tw-prose-quotes": "var(--muted)",
                    "--tw-prose-quote-borders": "var(--accent)",
                  } as React.CSSProperties
                }
                dangerouslySetInnerHTML={{ __html: article.aiTranslation }}
              />
            ) : (
              <div
                className="prose prose-neutral max-w-none dark:prose-invert
                  prose-headings:font-bold prose-headings:tracking-tight
                  prose-h1:text-xl prose-h2:text-lg prose-h3:text-base
                  prose-p:leading-7 prose-p:text-[15px]
                  prose-a:underline prose-a:underline-offset-2
                  prose-img:rounded-lg prose-img:shadow-sm
                  prose-pre:rounded-lg prose-pre:text-sm
                  prose-code:text-sm prose-code:before:content-none prose-code:after:content-none
                  prose-blockquote:border-l-2 prose-blockquote:not-italic
                  prose-li:leading-7"
                style={
                  {
                    "--tw-prose-body": "var(--fg)",
                    "--tw-prose-headings": "var(--fg)",
                    "--tw-prose-links": "var(--accent)",
                    "--tw-prose-quotes": "var(--muted)",
                    "--tw-prose-quote-borders": "var(--accent)",
                  } as React.CSSProperties
                }
                dangerouslySetInnerHTML={{ __html: article.contentHtml }}
              />
            )}
          </>
        ) : (
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            本文を取得できませんでした
          </p>
        )}
      </div>
    </article>
  );
}
