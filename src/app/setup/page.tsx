"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function SetupPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/setup")
      .then((r) => r.json())
      .then((d) => {
        if (d.completed) router.replace("/login");
      })
      .catch(() => {});
  }, [router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("パスワードは8文字以上");
      return;
    }
    if (password !== confirm) {
      setError("パスワードが一致しません");
      return;
    }
    setLoading(true);
    const res = await fetch("/api/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    setLoading(false);
    if (res.ok) router.replace("/login");
    else setError((await res.json()).error ?? "エラー");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center justify-center p-6">
      <form onSubmit={submit} className="w-full space-y-4">
        <h1 className="text-2xl font-semibold">Yomu 初回セットアップ</h1>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          管理用のパスワードを設定してください (8文字以上)
        </p>
        <input
          type="password"
          placeholder="パスワード"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded border px-3 py-2"
          style={{ borderColor: "var(--card-border)", background: "var(--card)" }}
          autoComplete="new-password"
        />
        <input
          type="password"
          placeholder="確認"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="w-full rounded border px-3 py-2"
          style={{ borderColor: "var(--card-border)", background: "var(--card)" }}
          autoComplete="new-password"
        />
        {error && <p className="text-sm text-red-500">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded px-3 py-2 font-medium disabled:opacity-50"
          style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
        >
          {loading ? "..." : "設定する"}
        </button>
      </form>
    </main>
  );
}
