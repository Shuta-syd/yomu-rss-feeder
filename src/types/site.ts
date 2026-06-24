export interface SavedSiteDTO {
  id: string;
  title: string;
  url: string;
  category: string;
  faviconUrl: string | null;
  createdAt: number;
}
