"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import styles from "./login.module.css";

export default function LoginPage() {
  const router = useRouter();
  const [uid, setUid] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setError(null);
    if (!/^\d{10}$/.test(uid)) {
      setError("UIDは10桁の数字で入力してください。");
      return;
    }
    if (password.length < 8) {
      setError("パスワードは8文字以上で入力してください。");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid, password }),
      });
      if (res.ok) router.replace("/feeds");
      else if (res.status === 429) setError("試行回数が多すぎます。しばらく待ってから再試行してください。");
      else if (res.status >= 500) setError("サーバーに接続できませんでした。しばらく待ってから再試行してください。");
      else setError("UIDまたはパスワードが正しくありません。");
    } catch {
      setError("通信できませんでした。接続を確認して、もう一度お試しください。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <div className={styles.topbar}>
          <span className={styles.brand}><img src="/icon.svg" width={32} height={32} alt="" />Yomu</span>
          <ThemeToggle compact />
        </div>
        <section className={styles.card} aria-labelledby="login-title">
          <header className={styles.header}>
            <span className={styles.eyebrow}>YOUR DAILY READER</span>
            <h1 id="login-title">読む時間を、<br />あなたらしく。</h1>
            <p>Yomuにログインして、気になるニュースの続きを。</p>
          </header>
          <form onSubmit={submit} className={styles.form} aria-label="ログイン" aria-busy={loading}>
            <div className={styles.field}>
              <label htmlFor="uid">UID<span>10桁の数字</span></label>
              <input
                id="uid" name="username" type="text" inputMode="numeric" pattern="\d{10}"
                maxLength={10} required placeholder="UIDを入力" value={uid}
                onChange={(e) => setUid(e.target.value.replace(/\D/g, ""))}
                autoComplete="username" aria-describedby="uid-help"
              />
              <p id="uid-help" className={styles.hint}>初回設定時に発行されたIDです。</p>
            </div>
            <div className={styles.field}>
              <div className={styles.passwordLabel}>
                <label htmlFor="password">パスワード</label>
                <button type="button" className={styles.reveal} aria-controls="password" aria-pressed={showPassword} aria-label={showPassword ? "パスワードを隠す" : "パスワードを表示"} onClick={() => setShowPassword(value => !value)}>
                  {showPassword ? "隠す" : "表示する"}
                </button>
              </div>
              <input
                id="password" name="password" type={showPassword ? "text" : "password"}
                required minLength={8} placeholder="パスワードを入力" value={password}
                onChange={(e) => setPassword(e.target.value)} autoComplete="current-password"
              />
            </div>
            {error && <p className={styles.error} role="alert">{error}</p>}
            <button type="submit" disabled={loading} className={styles.submit}>
              {loading ? <><span className={styles.spinner} aria-hidden="true" />ログイン中…</> : <>ログイン<span aria-hidden="true">→</span></>}
            </button>
          </form>
        </section>
        <p className={styles.footer}>気になる記事を、ひとつの場所に。</p>
      </div>
    </main>
  );
}
