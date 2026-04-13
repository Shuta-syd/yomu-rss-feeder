"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { XLikesList } from "@/components/x/XLikesList";
import { XAnalysisPanel } from "@/components/x/XAnalysisPanel";
import type { XLike } from "@/lib/db/schema";

export default function XPage() {
  const router = useRouter();
  const [connected, setConnected] = useState<boolean | null>(null);
  const [likes, setLikes] = useState<XLike[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [fetchResult, setFetchResult] = useState<string | null>(null);

  const checkConnection = useCallback(async () => {
    const res = await fetch("/api/x/status");
    if (res.status === 401) {
      router.replace("/login");
      return;
    }
    const data = await res.json();
    setConnected(data.connected);
  }, [router]);

  const loadLikes = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/x/likes?limit=100");
    if (res.status === 401) {
      router.replace("/login");
      return;
    }
    if (res.ok) {
      const data = await res.json();
      setLikes(data.likes);
    }
    setLoading(false);
  }, [router]);

  useEffect(() => {
    checkConnection();
    loadLikes();
  }, [checkConnection, loadLikes]);

  async function handleFetchLikes() {
    setFetching(true);
    setFetchResult(null);
    try {
      const res = await fetch("/api/x/likes", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setFetchResult(`${data.fetched}件の新しいいいねを取得しました`);
        loadLikes();
      } else {
        const data = await res.json();
        setFetchResult(`エラー: ${data.error}`);
      }
    } catch {
      setFetchResult("取得に失敗しました");
    } finally {
      setFetching(false);
    }
  }

  if (connected === null) {
    return (
      <div className="flex h-screen items-center justify-center">
        <span style={{ color: "var(--muted)" }}>読み込み中...</span>
      </div>
    );
  }

  if (!connected) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <p className="mb-4 text-lg">X未連携</p>
          <p className="mb-4 text-sm" style={{ color: "var(--muted)" }}>
            設定画面でXアカウントを連携してください
          </p>
          <a
            href="/settings"
            className="rounded px-4 py-2 text-sm"
            style={{ background: "var(--accent)", color: "white" }}
          >
            設定画面へ
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen">
      {/* 左: いいね一覧 */}
      <section
        className="flex w-1/2 flex-col border-r"
        style={{ borderColor: "var(--card-border)" }}
      >
        <div
          className="flex items-center justify-between border-b p-3"
          style={{ borderColor: "var(--card-border)" }}
        >
          <h2 className="text-sm font-semibold">X いいね</h2>
          <div className="flex items-center gap-2">
            {fetchResult && (
              <span className="text-xs" style={{ color: "var(--muted)" }}>
                {fetchResult}
              </span>
            )}
            <button
              onClick={handleFetchLikes}
              disabled={fetching}
              className="rounded px-3 py-1 text-xs"
              style={{
                background: "var(--accent)",
                color: "white",
                opacity: fetching ? 0.5 : 1,
              }}
            >
              {fetching ? "取得中..." : "いいね取得"}
            </button>
            <a
              href="/feeds"
              className="rounded px-2 py-1 text-xs"
              style={{ background: "var(--card)", border: "1px solid var(--card-border)" }}
            >
              RSS
            </a>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          <XLikesList likes={likes} loading={loading} />
        </div>
      </section>

      {/* 右: AI分析パネル */}
      <section className="flex w-1/2 flex-col">
        <div
          className="border-b p-3"
          style={{ borderColor: "var(--card-border)" }}
        >
          <h2 className="text-sm font-semibold">AI分析</h2>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          <XAnalysisPanel />
        </div>
      </section>
    </div>
  );
}
