"use client";

import type { ReadFilter } from "@/lib/articles-params";

interface Props {
  value: ReadFilter;
  onChange: (next: ReadFilter) => void;
}

const OPTIONS: { value: ReadFilter; label: string; title: string }[] = [
  { value: "unread", label: "未読", title: "未読のみ" },
  { value: "read", label: "既読", title: "既読のみ" },
  { value: "all", label: "全て", title: "未読・既読を混在表示" },
];

export function ReadFilterToggle({ value, onChange }: Props) {
  return (
    <div
      className="flex shrink-0 overflow-hidden rounded text-xs"
      style={{ border: "1px solid var(--card-border)" }}
      role="radiogroup"
      aria-label="既読フィルタ"
    >
      {OPTIONS.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            title={opt.title}
            onClick={() => onChange(opt.value)}
            className="px-2 py-1"
            style={{
              background: active ? "var(--accent-subtle)" : "var(--card)",
              fontWeight: active ? 600 : 400,
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
