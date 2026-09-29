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
    <div className="reader-read-toggle" role="group" aria-label="既読フィルタ">
      {OPTIONS.map(opt=><button key={opt.value} type="button" aria-pressed={value===opt.value} title={opt.title} onClick={()=>onChange(opt.value)}>{opt.label}</button>)}
    </div>
  );
}
