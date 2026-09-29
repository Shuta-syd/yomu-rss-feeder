import { describe, expect, it } from "vitest";
import { articleNeighbors } from "../../src/lib/article-navigation";
const a = { id: "a", sortKey: 30 };
const b = { id: "b", sortKey: 20 };
const c = { id: "c", sortKey: 10 };
const groups = [a, b, c].map(representative => ({ representative, related: [] as typeof a[] }));
describe("article navigation in the displayed list", () => {
  it("uses displayed order and stops at either end", () => {
    expect(articleNeighbors(groups, a)).toEqual({ previous: null, next: b });
    expect(articleNeighbors(groups, b)).toEqual({ previous: a, next: c });
    expect(articleNeighbors(groups, c)).toEqual({ previous: b, next: null });
  });
  it("navigates from related articles through representatives without repeating the group", () => {
    const related = { id: "related", sortKey: 25 };
    expect(articleNeighbors([{ representative: a, related: [related] }, groups[1]!, groups[2]!], related)).toEqual({ previous: null, next: b });
  });
  it("keeps a position when the open article is removed from later or unread results", () => {
    expect(articleNeighbors([groups[0]!, groups[2]!], b)).toEqual({ previous: a, next: c });
  });
  it("uses descending ID to resolve equal dates consistently with the list", () => {
    expect(articleNeighbors([{ representative: { ...c, sortKey: 20 }, related: [] }, { representative: { ...a, sortKey: 20 }, related: [] }], b)).toEqual({ previous: { ...c, sortKey: 20 }, next: { ...a, sortKey: 20 } });
  });
  it("does not choose an arbitrary article before one is selected or from an empty list", () => {
    expect(articleNeighbors(groups, null)).toEqual({ previous: null, next: null });
    expect(articleNeighbors([], b)).toEqual({ previous: null, next: null });
  });
});
