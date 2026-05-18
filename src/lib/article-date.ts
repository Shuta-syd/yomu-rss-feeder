const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"] as const;

export function dateKey(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfLocalDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function formatDateHeader(ms: number, now: number): string {
  const today = startOfLocalDay(now);
  const target = startOfLocalDay(ms);
  const dayMs = 24 * 60 * 60 * 1000;
  const diffDays = Math.round((today - target) / dayMs);

  if (diffDays === 0) return "今日";
  if (diffDays === 1) return "昨日";

  const d = new Date(ms);
  const wd = WEEKDAYS[d.getDay()];
  const sameYear = d.getFullYear() === new Date(now).getFullYear();
  if (sameYear) {
    return `${d.getMonth() + 1}月${d.getDate()}日(${wd})`;
  }
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日(${wd})`;
}
