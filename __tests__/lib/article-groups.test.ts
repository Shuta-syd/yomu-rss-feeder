import { describe, expect, it } from "vitest";
import { articleUrlKey, groupArticles } from "../../src/lib/article-groups";
const article = (id: string, overrides = {}) => ({id, url:`https://example.com/${id}`, title:"企業の新サービスについて詳しい導入事例を発表しました", publishedAt:1000000000, ...overrides});
describe("conservative article grouping", () => {
  it("groups tracking variants but keeps content query parameters", () => {
    expect(articleUrlKey("https://example.com/a?id=1&utm_source=rss#top")).toBe("https://example.com/a?id=1");
    expect(groupArticles([article("a",{url:"https://example.com/a?id=1"}),article("b",{url:"https://example.com/a?id=2",title:"違う記事"})])).toHaveLength(2);
    const groups=groupArticles([article("a"),article("b",{url:"https://example.com/a?utm_source=rss",title:"別の見出し"})]);
    expect(groups[0]?.related.map(a=>a.id)).toEqual(["b"]);
  });
  it("normalizes full width and whitespace, preserving the first representative", () => {
    const groups=groupArticles([article("a"),article("b")]);
    expect(groups[0]?.representative.id).toBe("a");
    expect(groups[0]?.related).toHaveLength(1);
    expect(groupArticles([article("a",{title:"ＡＩ service  announcement for all users"}),article("b",{title:"AI service announcement for all users"})])).toHaveLength(1);
  });
  it("keeps different numbers, negation, short headlines and dated recurring stories separate", () => {
    for (const overrides of [{title:"企業の新サービスについて詳しい導入事例を発表しません"},{publishedAt:1000000000+49*3600000},{publishedAt:null}]) expect(groupArticles([article("a"),article("b",overrides)])).toHaveLength(2);
    expect(groupArticles([article("a",{title:"今日のニュース"}),article("b",{title:"今日のニュース"})])).toHaveLength(2);
    expect(groupArticles([article("a",{title:"企業の2026年度決算について詳しい業績を発表しました"}),article("b",{title:"企業の2025年度決算について詳しい業績を発表しました"})])).toHaveLength(2);
  });
  it("does not form a chain of matching dates beyond the representative window", () => {
    expect(groupArticles([article("a"),article("b",{publishedAt:1000000000+36*3600000}),article("c",{publishedAt:1000000000+72*3600000})])).toHaveLength(2);
  });
  it("does not mutate articles, merge invalid URLs, or lose items", () => {
    const items=[article("a",{url:"",title:"短い"}),article("b",{url:"",title:"短い"}),article("c")];
    const before=JSON.stringify(items); const groups=groupArticles(items);
    expect(groups).toHaveLength(3);expect(JSON.stringify(items)).toBe(before);
    expect(groups.flatMap(g=>[g.representative,...g.related]).map(a=>a.id)).toEqual(["a","b","c"]);
  });
});
