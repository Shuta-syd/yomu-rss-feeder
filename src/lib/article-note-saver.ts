import type { ArticleDTO } from "@/types/article";

export type SaveStatus = "idle" | "saving" | "saved";
type StatusListener = (s: SaveStatus) => void;
type UpdateListener = (a: ArticleDTO) => void;

interface Queue {
  desired: string;
  lastSent: string;
  inflight: Promise<void>;
  debounceTimer: ReturnType<typeof setTimeout> | null;
  status: SaveStatus;
  statusListeners: Set<StatusListener>;
}

const DEBOUNCE_MS = 500;
const queues = new Map<string, Queue>();
const updateListeners = new Set<UpdateListener>();

function getQueue(id: string, initial: string): Queue {
  let q = queues.get(id);
  if (!q) {
    q = {
      desired: initial,
      lastSent: initial,
      inflight: Promise.resolve(),
      debounceTimer: null,
      status: "idle",
      statusListeners: new Set(),
    };
    queues.set(id, q);
  }
  return q;
}

function setStatus(q: Queue, s: SaveStatus) {
  if (q.status === s) return;
  q.status = s;
  for (const l of q.statusListeners) l(s);
}

export function scheduleNoteSave(articleId: string, value: string, initial: string) {
  const q = getQueue(articleId, initial);
  q.desired = value;
  if (q.debounceTimer) clearTimeout(q.debounceTimer);
  if (q.desired !== q.lastSent) setStatus(q, "saving");
  q.debounceTimer = setTimeout(() => {
    q.debounceTimer = null;
    q.inflight = q.inflight.then(() => drain(articleId, q));
  }, DEBOUNCE_MS);
}

async function drain(id: string, q: Queue) {
  while (q.desired !== q.lastSent) {
    const value = q.desired;
    try {
      const res = await fetch(`/api/articles/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: value.trim() || null }),
      });
      if (!res.ok) {
        setStatus(q, "idle");
        return;
      }
      const updated = (await res.json()) as ArticleDTO;
      q.lastSent = value;
      for (const l of updateListeners) l(updated);
    } catch {
      setStatus(q, "idle");
      return;
    }
  }
  setStatus(q, "saved");
}

export function subscribeStatus(
  articleId: string,
  initial: string,
  listener: StatusListener,
): () => void {
  const q = getQueue(articleId, initial);
  q.statusListeners.add(listener);
  listener(q.status);
  return () => {
    q.statusListeners.delete(listener);
  };
}

export function subscribeUpdates(listener: UpdateListener): () => void {
  updateListeners.add(listener);
  return () => {
    updateListeners.delete(listener);
  };
}

// Test-only: reset internal state
export function _resetForTest() {
  for (const q of queues.values()) {
    if (q.debounceTimer) clearTimeout(q.debounceTimer);
  }
  queues.clear();
  updateListeners.clear();
}
