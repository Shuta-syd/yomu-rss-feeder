"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [uid, setUid] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!/^\d{10}$/.test(uid)) {
      setError("UIDは10桁の数字です");
      return;
    }
    if (password.length < 8) {
      setError("パスワードは8文字以上です");
      return;
    }
    setLoading(true);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uid, password }),
    });
    setLoading(false);
    if (res.ok) router.replace("/feeds");
    else if (res.status === 429) setError("試行回数が多すぎます。しばらく待ってから再試行してください。");
    else setError("UIDまたはパスワードが正しくありません");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center justify-center p-6">
      <form onSubmit={submit} className="w-full space-y-4">
        <h1 className="text-2xl font-semibold">Yomu ログイン</h1>
        <input
          type="text"
          inputMode="numeric"
          pattern="\d{10}"
          maxLength={10}
          placeholder="UID (10桁)"
          value={uid}
          onChange={(e) => setUid(e.target.value.replace(/\D/g, ""))}
          className="w-full rounded border px-3 py-2 font-mono tracking-widest"
          style={{ borderColor: "var(--card-border)", background: "var(--card)" }}
          autoComplete="username"
          autoFocus
        />
        <input
          type="password"
          placeholder="パスワード"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded border px-3 py-2"
          style={{ borderColor: "var(--card-border)", background: "var(--card)" }}
          autoComplete="current-password"
        />
        {error && <p className="text-sm text-red-500">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded px-3 py-2 font-medium disabled:opacity-50"
          style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
        >
          {loading ? "..." : "ログイン"}
        </button>
      </form>
    </main>
  );
}
