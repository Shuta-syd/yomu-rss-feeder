const genres = ["すべて", "テクノロジー", "経済・ビジネス", "暮らし・地域", "文化・娯楽", "スポーツ", "科学・環境", "その他"];
const rules: [string, RegExp][] = [
  ["スポーツ", /F1|formula 1|grand prix|ランニング|マラソン|陸上|サッカー|野球|ランナー|runners|running street/i],
  ["文化・娯楽", /アニメ|漫画|映画|音楽|ゲーム|小説|書評|エンタメ|任天堂|playstation/i],
  ["暮らし・地域", /新宿|グルメ|レストラン|旅行|ホテル|観光|レシピ|子育て|暮らし|開店|閉店/i],
  ["科学・環境", /宇宙|気候|脱炭素|再生可能|蓄電|太陽光|バッテリー|battery|climate|space telescope/i],
  ["テクノロジー", /\bAI\b|LLM|Gemini|Claude|GPT|プログラ|ソフトウェア|半導体|データセンター|ロボット|セキュリティ|privacy|linux|github|google|apple|microsoft|javascript/i],
  ["経済・ビジネス", /決算|株|投資|買収|資金調達|起業|スタートアップ|経営|企業|事業|市場|日経|金融|経済/i],
];
const industryRules: [string, RegExp][] = [
  ["IT・通信", /ソフトウェア|クラウド|データセンター|通信|\bAI\b|LLM|Gemini|Claude|GPT|google|github/i],
  ["製造・半導体", /製造|工場|半導体|自動車|ロボット|nvidia|tsmc/i],
  ["食品・農業", /食品|農業|農家|農産|飲料|外食|レストラン|グルメ/],
  ["金融", /銀行|証券|金融|保険|金利|為替|株価/],
  ["医療・健康", /医療|健康|病院|製薬|治療|睡眠/],
  ["小売・観光", /小売|店舗|旅行|ホテル|観光|百貨店|ECサイト/],
  ["エネルギー", /電力|エネルギー|発電|蓄電|バッテリー|battery/i],
];
const topicRules: [string, RegExp][] = [
  ["AI", /\bAI\b|人工知能|LLM|Gemini|Claude|GPT/i], ["ロボット・自動化", /ロボット|自動化|省人化|robot/i],
  ["新製品・サービス", /新製品|新サービス|発売|リリース|発表|launch/i], ["投資・企業動向", /投資|買収|決算|資金調達|提携/],
  ["開発・学び", /入門|解説|学習|開発|プログラ|tutorial/i], ["プライバシー", /プライバシー|セキュリティ|privacy|security/i],
];
export function classify(a: {title: string; summary: string | null; source: string}) {
  const text = `${a.title} ${a.summary ?? ""}`;
  // Title/summary first; source is only a fallback for the broad section.
  const genre = rules.find(([,r])=>r.test(text))?.[0] ?? rules.find(([,r])=>r.test(a.source))?.[0] ?? "その他";
  return {...a, genre, industries: industryRules.filter(([,r])=>r.test(text)).map(([n])=>n), topics: topicRules.filter(([,r])=>r.test(text)).map(([n])=>n)};
}

export const classificationGroups = [{label:"ジャンル",values:genres.slice(1)},{label:"業界",values:industryRules.map(([n])=>n)},{label:"テーマ",values:topicRules.map(([n])=>n)}];
