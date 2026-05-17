"use client";

import { useCallback, useState } from "react";

interface Props {
  url: string | null;
  title: string;
  size?: "sm" | "md";
}

export function FeedIcon({ url, title, size = "sm" }: Props) {
  const [failed, setFailed] = useState(false);
  const onError = useCallback(() => setFailed(true), []);
  const dimCls = size === "md" ? "h-5 w-5" : "h-4 w-4";
  const textCls = size === "md" ? "text-xs" : "text-[10px]";

  if (!url || failed) {
    return (
      <span
        className={`${dimCls} flex shrink-0 items-center justify-center rounded-sm ${textCls} font-bold`}
        style={{ background: "var(--card-border)", color: "var(--muted)" }}
      >
        {title.charAt(0).toUpperCase()}
      </span>
    );
  }

  return (
    <img
      src={url}
      alt=""
      className={`${dimCls} shrink-0 rounded-sm`}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={onError}
    />
  );
}
