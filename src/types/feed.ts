export interface FeedWithUnread {
  id: string;
  title: string;
  url: string;
  siteUrl: string | null;
  category: string;
  faviconUrl: string | null;
  fetchIntervalMin: number;
  lastFetchedAt: number | null;
  lastFetchStatus: string;
  consecutiveFetchFailures: number;
  aiEnabled: boolean;
  unreadCount: number;
}
