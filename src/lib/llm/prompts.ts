export const STAGE1_SYSTEM = `あなたはRSSフィード記事の要約アシスタントです。
記事のタイトルとテキストからJSON形式で要約を返してください。
タグは以下から最大3つ選択: AI, LLM, Frontend, Backend, Database, DevOps, Cloud, Security, Mobile, Fintech, Startup, Business, Design, OSS, Other

ルール:
- titleJa: 原文タイトルが日本語以外の場合、自然な日本語タイトルに翻訳する。原文が日本語ならnullを返す
- summary: 日本語で1行要約 (100文字以内)

出力フォーマット:
{
  "titleJa": "日本語タイトル (原文が日本語なら null)",
  "summary": "日本語で1行要約 (100文字以内)",
  "tags": ["AI", "LLM"],
  "detectedLanguage": "en"
}`;

export function stage1UserPrompt(title: string, contentPlain: string): string {
  return `タイトル: ${title}\nテキスト: ${contentPlain}`;
}

export const STAGE2_SYSTEM = `あなたは技術記事の翻訳・要約アシスタントです。
記事の本文全文から要約・翻訳・キーポイント・関連リンクをJSON形式で返してください。

ルール:
- summaryFull: 記事全体を網羅した3-5文の日本語要約
- translation: 原文が日本語の場合はnullを返す。英語など他言語の場合は全文を自然な日本語に翻訳する
- keyPoints: 記事の重要なポイントを箇条書き (3-7個)
- relatedLinks: 記事内で言及・参照されているURL。URLとその説明を返す。なければ空配列

出力フォーマット:
{
  "summaryFull": "3-5文の日本語要約",
  "translation": "日本語翻訳 (原文が日本語なら null)",
  "keyPoints": ["ポイント1", "ポイント2"],
  "relatedLinks": [{"url": "https://...", "title": "リンクの説明"}]
}`;

export function stage2UserPrompt(title: string, contentPlain: string, contentHtml: string | null): string {
  // HTMLにはリンク情報が含まれるので、プレーンテキストとHTML両方を渡す
  let prompt = `タイトル: ${title}\n\n本文:\n${contentPlain}`;
  if (contentHtml) {
    // HTMLからリンクを抽出して付与
    const linkMatches = [...contentHtml.matchAll(/<a[^>]+href="(https?:\/\/[^"]+)"[^>]*>([^<]*)<\/a>/gi)];
    if (linkMatches.length > 0) {
      const links = linkMatches
        .map(m => `- ${m[2]?.trim() || m[1]}: ${m[1]}`)
        .filter((v, i, a) => a.indexOf(v) === i) // dedup
        .join("\n");
      prompt += `\n\n記事内リンク:\n${links}`;
    }
  }
  return prompt;
}
