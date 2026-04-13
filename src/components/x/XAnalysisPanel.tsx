"use client";

import { useState } from "react";

interface AnalysisResult {
  trends: string[];
  topics: string[];
  notableAccounts: { username: string; reason: string }[];
  summary: string;
}

export function XAnalysisPanel() {
  const [analyzing, setAnalyzing] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runAnalysis() {
    setAnalyzing(true);
    setStreamText("");
    setResult(null);
    setError(null);

    try {
      const res = await fetch("/api/x/analyze", { method: "POST" });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "分析に失敗しました");
        setAnalyzing(false);
        return;
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        let eventType = "";
        for (const line of lines) {
          if (line.startsWith("event: ")) {
            eventType = line.slice(7);
          } else if (line.startsWith("data: ")) {
            const data = JSON.parse(line.slice(6));
            if (eventType === "chunk") {
              setStreamText((prev) => prev + data.text);
            } else if (eventType === "done") {
              setResult(data);
              setStreamText("");
            } else if (eventType === "error") {
              setError(data.message);
            }
          }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "分析に失敗しました");
    } finally {
      setAnalyzing(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <button
        onClick={runAnalysis}
        disabled={analyzing}
        className="rounded px-4 py-2 text-sm font-medium"
        style={{
          background: analyzing ? "var(--card)" : "var(--accent)",
          color: analyzing ? "var(--muted)" : "white",
          border: "1px solid var(--card-border)",
        }}
      >
        {analyzing ? "分析中..." : "トレンド分析"}
      </button>

      {error && (
        <div
          className="rounded p-3 text-sm"
          style={{ background: "var(--error-bg, #fef2f2)", color: "var(--error, #dc2626)" }}
        >
          {error}
        </div>
      )}

      {analyzing && streamText && (
        <div
          className="rounded-lg p-4 text-sm leading-relaxed"
          style={{ background: "var(--card)", border: "1px solid var(--card-border)" }}
        >
          <pre className="whitespace-pre-wrap font-sans">
            {streamText}
            <span className="animate-pulse">|</span>
          </pre>
        </div>
      )}

      {result && (
        <div className="space-y-4">
          <div
            className="rounded-lg p-4"
            style={{ background: "var(--card)", border: "1px solid var(--card-border)" }}
          >
            <h3 className="mb-2 text-sm font-semibold">サマリー</h3>
            <p className="text-sm leading-relaxed">{result.summary}</p>
          </div>

          <div
            className="rounded-lg p-4"
            style={{ background: "var(--card)", border: "1px solid var(--card-border)" }}
          >
            <h3 className="mb-2 text-sm font-semibold">トレンド</h3>
            <ul className="space-y-1">
              {result.trends.map((t, i) => (
                <li key={i} className="text-sm">
                  <span style={{ color: "var(--accent)" }} className="mr-2">-</span>
                  {t}
                </li>
              ))}
            </ul>
          </div>

          <div
            className="rounded-lg p-4"
            style={{ background: "var(--card)", border: "1px solid var(--card-border)" }}
          >
            <h3 className="mb-2 text-sm font-semibold">トピック</h3>
            <div className="flex flex-wrap gap-2">
              {result.topics.map((t, i) => (
                <span
                  key={i}
                  className="rounded-full px-3 py-1 text-xs"
                  style={{ background: "var(--accent-subtle)", color: "var(--accent)" }}
                >
                  {t}
                </span>
              ))}
            </div>
          </div>

          {result.notableAccounts.length > 0 && (
            <div
              className="rounded-lg p-4"
              style={{ background: "var(--card)", border: "1px solid var(--card-border)" }}
            >
              <h3 className="mb-2 text-sm font-semibold">注目アカウント</h3>
              <ul className="space-y-2">
                {result.notableAccounts.map((a, i) => (
                  <li key={i} className="text-sm">
                    <a
                      href={`https://x.com/${a.username}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium underline"
                      style={{ color: "var(--accent)" }}
                    >
                      @{a.username}
                    </a>
                    <span className="ml-2" style={{ color: "var(--muted)" }}>
                      {a.reason}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
