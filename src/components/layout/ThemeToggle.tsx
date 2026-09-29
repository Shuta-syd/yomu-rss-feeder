"use client";

import { useEffect, useState } from "react";

import { ReaderIcon } from "@/components/ui/ReaderIcon";

type Theme = "light" | "dark";

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem("theme") as Theme | null;
    const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    setTheme(saved ?? (systemDark ? "dark" : "light"));
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("theme", next);
    document.documentElement.classList.toggle("dark", next === "dark");
  }

  if (theme === null) return null;

  return (
    <button
      type="button"
      onClick={toggle}
      className={compact ? "reader-icon-button" : "shrink-0 rounded px-2 py-1 text-sm"}
      style={compact ? undefined : { background: "var(--card)", border: "1px solid var(--card-border)" }}
      aria-label={theme === "dark" ? "ライトモードに切り替え" : "ダークモードに切り替え"}
    >
      {compact ? <ReaderIcon name={theme === "dark" ? "moon" : "sun"}/> : theme === "dark" ? "🌙" : "☀️"}
    </button>
  );
}
