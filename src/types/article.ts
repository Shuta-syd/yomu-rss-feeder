export interface ArticleDTO {
  id: string;
  feedId: string;
  feedTitle: string | null;
  title: string;
  url: string;
  author: string | null;
  contentHtml: string | null;
  contentPlain: string | null;
  thumbnailUrl: string | null;
  publishedAt: number | null;
  sortKey: number;
  detectedLanguage: string | null;
  isRead: boolean;
  isStarred: boolean;
  readAt: number | null;
  aiSummaryShort: string | null;
  aiTitleJa: string | null;
  aiTags: string | null;
  aiStage1Status: string;
  aiSummaryFull: string | null;
  aiTranslation: string | null;
  aiKeyPoints: string | null;
  aiRelatedLinks: string | null;
  aiStage2Status: string;
  aiStage2Error: string | null;
  createdAt: number;
}

export interface ArticleListResponse {
  articles: ArticleDTO[];
  nextCursor: string | null;
  total: number;
}
