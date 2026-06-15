export function readPositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;

  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value <= 0) {
    console.warn(`[yomu] Invalid ${name}=${raw}; using ${fallback}`);
    return fallback;
  }

  return value;
}

export function readBooleanEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw == null || raw === "") return fallback;

  if (raw === "true" || raw === "1") return true;
  if (raw === "false" || raw === "0") return false;

  console.warn(`[yomu] Invalid ${name}=${raw}; using ${fallback}`);
  return fallback;
}
