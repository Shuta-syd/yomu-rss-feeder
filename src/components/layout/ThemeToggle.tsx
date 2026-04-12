"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  const current = theme === "system" ? resolvedTheme : theme;
  return (
    <button
      type="button"
      onClick={() => setTheme(current === "dark" ? "light" : "dark")}
      className="rounded px-2 py-1 text-xs"
      style={{ background: "var(--card)", border: "1px solid var(--card-border)" }}
      aria-label="Toggle theme"
    >
      {current === "dark" ? "🌙" : "☀️"}
    </button>
  );
}
