export type AIPauseReason='budget'|'pricing'|'api_key'|null;
export type AIUpdateStatus={pending:number;processing:number;failed:number;currentTitle:string|null;currentFeedTitle:string|null;pauseReason:AIPauseReason};
export type FeedUpdateStatus={id:string;title:string;category:string;lastFetchedAt:number|null;lastFetchStatus:string;lastFetchError:string|null;consecutiveFetchFailures:number};
export function aiPauseReason(counts:{pending:number;processing:number;budgetWaiting:number;pricingWaiting:number},hasKey:boolean):AIPauseReason {
 if(counts.pending===0||counts.processing>0)return null;
 if(!hasKey)return 'api_key';
 if(counts.pricingWaiting>0)return 'pricing';
 if(counts.budgetWaiting>0)return 'budget';
 return null;
}
export const AI_PAUSE_LABELS={budget:'AI予算待ち',pricing:'AI単価の設定待ち',api_key:'AIキーの設定待ち'};
export function feedFailureMessage(error:string|null):string {
 const code=error?.match(/(?:fetch failed:|status(?: code)?[: ]+)\s*(\d{3})/i)?.[1];
 if(code==='401'||code==='403')return `HTTP ${code}：取得元にアクセスを拒否されました。`;
 if(code==='404'||code==='410')return `HTTP ${code}：フィードが見つかりません。URLを確認してください。`;
 if(code==='429')return 'HTTP 429：取得元のアクセス制限です。時間を空けて再取得してください。';
 if(code)return `HTTP ${code}：取得元が正常に応答しませんでした。`;
 if(/timeout|timed out|abort/i.test(error??''))return '応答が時間内に届きませんでした。';
 return 'フィードを取得できませんでした。元サイトやフィードURLを確認してください。';
}
