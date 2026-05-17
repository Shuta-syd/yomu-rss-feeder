import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { ArticleDTO } from "@/types/article";
import {
  scheduleNoteSave,
  subscribeStatus,
  subscribeUpdates,
  _resetForTest,
} from "@/lib/article-note-saver";

function makeArticle(id: string, note: string | null): ArticleDTO {
  return {
    id,
    feedId: "f1",
    feedTitle: "Feed",
    title: "T",
    url: "https://e/" + id,
    author: null,
    contentHtml: null,
    contentPlain: null,
    thumbnailUrl: null,
    publishedAt: null,
    sortKey: 0,
    detectedLanguage: null,
    isRead: false,
    isStarred: false,
    readAt: null,
    aiSummaryShort: null,
    aiTitleJa: null,
    aiTags: null,
    aiStage1Status: "pending",
    aiSummaryFull: null,
    aiTranslation: null,
    aiKeyPoints: null,
    aiRelatedLinks: null,
    aiStage2Status: "none",
    aiStage2Error: null,
    note,
    createdAt: 0,
  };
}

describe("article-note-saver", () => {
  beforeEach(() => {
    _resetForTest();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("debounce 後に最新値だけ 1 回 PATCH される", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makeArticle("a1", "C"),
    });
    vi.stubGlobal("fetch", fetchMock);

    scheduleNoteSave("a1", "A", "");
    scheduleNoteSave("a1", "B", "");
    scheduleNoteSave("a1", "C", "");

    await vi.advanceTimersByTimeAsync(600);
    await vi.runAllTimersAsync();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(body.note).toBe("C");
  });

  it("空文字は note=null として送られる", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makeArticle("a1", null),
    });
    vi.stubGlobal("fetch", fetchMock);

    scheduleNoteSave("a1", "   ", "");
    await vi.advanceTimersByTimeAsync(600);
    await vi.runAllTimersAsync();

    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(body.note).toBeNull();
  });

  it("PATCH 中に新規 schedule が来たら 1 回だけ追加 PATCH される", async () => {
    let resolveFirst!: (v: { ok: boolean; json: () => Promise<ArticleDTO> }) => void;
    const firstPromise = new Promise<{ ok: boolean; json: () => Promise<ArticleDTO> }>(
      (r) => {
        resolveFirst = r;
      },
    );
    const fetchMock = vi
      .fn()
      .mockReturnValueOnce(firstPromise)
      .mockResolvedValue({ ok: true, json: async () => makeArticle("a1", "Z") });
    vi.stubGlobal("fetch", fetchMock);

    scheduleNoteSave("a1", "X", "");
    await vi.advanceTimersByTimeAsync(600); // debounce 経過 → 1 回目 fetch 発火 (まだ pending)
    await vi.runAllTimersAsync();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // PATCH 中に新規入力
    scheduleNoteSave("a1", "Z", "");
    await vi.advanceTimersByTimeAsync(600); // 2 回目の debounce
    await vi.runAllTimersAsync();

    // まだ 1 回目が完了していないので 2 回目は inflight chain 待ち
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // 1 回目を完了させる
    resolveFirst({ ok: true, json: async () => makeArticle("a1", "X") });
    await vi.runAllTimersAsync();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const body2 = JSON.parse(fetchMock.mock.calls[1]![1].body);
    expect(body2.note).toBe("Z");
  });

  it("失敗時に status が idle に戻る", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));

    const statuses: string[] = [];
    const unsub = subscribeStatus("a1", "", (s) => statuses.push(s));

    scheduleNoteSave("a1", "X", "");
    await vi.advanceTimersByTimeAsync(600);
    await vi.runAllTimersAsync();

    expect(statuses).toContain("idle");
    expect(statuses).toContain("saving");
    unsub();
  });

  it("subscribeUpdates が PATCH 成功時に呼ばれる", async () => {
    const dto = makeArticle("a1", "X");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => dto }));

    const updates: ArticleDTO[] = [];
    const unsub = subscribeUpdates((a) => updates.push(a));

    scheduleNoteSave("a1", "X", "");
    await vi.advanceTimersByTimeAsync(600);
    await vi.runAllTimersAsync();

    expect(updates).toHaveLength(1);
    expect(updates[0]!.id).toBe("a1");
    expect(updates[0]!.note).toBe("X");
    unsub();
  });

  it("複数 articleId のキューは独立してシリアル処理される", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      const id = url.split("/").pop()!;
      return { ok: true, json: async () => makeArticle(id, "x") };
    });
    vi.stubGlobal("fetch", fetchMock);

    scheduleNoteSave("a1", "v1", "");
    scheduleNoteSave("a2", "v2", "");
    await vi.advanceTimersByTimeAsync(600);
    await vi.runAllTimersAsync();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const urls = fetchMock.mock.calls.map((c) => c[0] as string).sort();
    expect(urls).toEqual(["/api/articles/a1", "/api/articles/a2"]);
  });
});
