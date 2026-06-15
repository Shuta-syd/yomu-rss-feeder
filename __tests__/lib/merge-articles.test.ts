import { describe, it, expect } from "vitest";
import { mergeArticles, appendArticles } from "@/lib/merge-articles";

interface Item {
  id: string;
  sortKey: number;
  label?: string;
}

const item = (id: string, sortKey: number, label?: string): Item => ({ id, sortKey, label });

describe("mergeArticles", () => {
  it("current が空なら fetched をそのまま返す", () => {
    const fetched = [item("b", 200), item("a", 100)];
    expect(mergeArticles([], fetched)).toEqual(fetched);
  });

  it("同一IDは fetched 側のフィールドで置き換える", () => {
    const current = [item("a", 100, "old")];
    const fetched = [item("a", 100, "new")];
    expect(mergeArticles(current, fetched)).toEqual([item("a", 100, "new")]);
  });

  it("同一IDかつ同一内容なら current の参照を維持する", () => {
    const currentItem = item("a", 100, "same");
    const fetched = [item("a", 100, "same")];
    const merged = mergeArticles([currentItem], fetched);
    expect(merged[0]).toBe(currentItem);
  });

  it("一覧全体が変わらない場合は配列参照も維持する", () => {
    const current = [item("b", 200, "same"), item("a", 100, "same")];
    const fetched = [item("b", 200, "same"), item("a", 100, "same")];
    const merged = mergeArticles(current, fetched);
    expect(merged).toBe(current);
  });

  it("fetched に含まれない読み込み済みの古い記事を保持する", () => {
    const current = [item("c", 300), item("b", 200), item("a", 100)];
    const fetched = [item("c", 300), item("b", 200)];
    expect(mergeArticles(current, fetched)).toEqual([
      item("c", 300),
      item("b", 200),
      item("a", 100),
    ]);
  });

  it("新着記事が先頭に入る", () => {
    const current = [item("b", 200), item("a", 100)];
    const fetched = [item("d", 400), item("c", 300), item("b", 200)];
    expect(mergeArticles(current, fetched)).toEqual([
      item("d", 400),
      item("c", 300),
      item("b", 200),
      item("a", 100),
    ]);
  });

  it("sortKey DESC で並び直す (fetched が current の途中より古い行へ到達するケース)", () => {
    const current = [item("e", 500), item("c", 300)];
    const fetched = [item("e", 500), item("d", 400), item("b", 200)];
    expect(mergeArticles(current, fetched)).toEqual([
      item("e", 500),
      item("d", 400),
      item("c", 300),
      item("b", 200),
    ]);
  });

  it("sortKey が同値のときは id DESC", () => {
    const current = [item("a", 100)];
    const fetched = [item("c", 100), item("b", 100)];
    expect(mergeArticles(current, fetched)).toEqual([
      item("c", 100),
      item("b", 100),
      item("a", 100),
    ]);
  });

  it("元の配列を破壊しない", () => {
    const current = [item("b", 200), item("a", 100)];
    const fetched = [item("c", 300)];
    const curCopy = structuredClone(current);
    const fetCopy = structuredClone(fetched);
    mergeArticles(current, fetched);
    expect(current).toEqual(curCopy);
    expect(fetched).toEqual(fetCopy);
  });
});

describe("appendArticles", () => {
  it("次ページを末尾に追記する", () => {
    const current = [item("c", 300), item("b", 200)];
    const page = [item("a", 100)];
    expect(appendArticles(current, page)).toEqual([
      item("c", 300),
      item("b", 200),
      item("a", 100),
    ]);
  });

  it("読み込み済みIDと重複する行は追記しない", () => {
    const current = [item("c", 300), item("b", 200)];
    const page = [item("b", 200, "dup"), item("a", 100)];
    expect(appendArticles(current, page)).toEqual([
      item("c", 300),
      item("b", 200),
      item("a", 100),
    ]);
  });
});
