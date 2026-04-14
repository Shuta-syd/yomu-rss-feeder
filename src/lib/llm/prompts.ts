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
- summaryFull: 記事全体を網羅した3-5文の日本語要約 (プレーンテキスト)
- translation: 原文が日本語の場合はnullを返す。英語など他言語の場合は全文を自然な日本語に翻訳する。
  * 出力はMarkdown形式
  * 元の構造を保持: 見出しは # ## ###、段落は空行区切り、リストは - or 1.、引用は >、コードは \`\`\`
  * 画像は ![](url)、リンクは [text](url) の形式。画像URLとリンクURLは原文のものを保持
  * 強調は **bold** や *italic*
- keyPoints: 記事の重要なポイントを箇条書き (3-7個、プレーンテキスト)
- relatedLinks: 記事内で言及・参照されているURL。URLとその説明を返す。なければ空配列

重要: JSON文字列内では改行は \\n、ダブルクォートは \\" にエスケープすること。

出力フォーマット:
{
  "summaryFull": "3-5文の日本語要約",
  "translation": "# 見出し\\n\\n段落1\\n\\n![](image-url) など、Markdown文字列 (原文が日本語なら null)",
  "keyPoints": ["ポイント1", "ポイント2"],
  "relatedLinks": [{"url": "https://...", "title": "リンクの説明"}]
}`;

export function stage2UserPrompt(title: string, contentPlain: string, contentHtml: string | null): string {
  // HTML本文があれば直接渡す (翻訳時に構造を保持するため)
  if (contentHtml) {
    return `タイトル: ${title}\n\n本文HTML:\n${contentHtml}`;
  }
  return `タイトル: ${title}\n\n本文:\n${contentPlain}`;
}
