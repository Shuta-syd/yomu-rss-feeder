"use client";

import type { ArticleDTO } from "@/types/article";
import { previewText } from "@/lib/article-preview";

export interface ArticleNavigationProps {
  previousArticle: ArticleDTO | null;
  nextArticle: ArticleDTO | null;
  onNavigate: (article: ArticleDTO) => void;
  hasMore: boolean;
  loadingMore: boolean;
  loadMoreError: string | null;
  onLoadMore: () => void;
}

export function ArticleNavigation({ previousArticle, nextArticle, onNavigate, hasMore, loadingMore, loadMoreError, onLoadMore }: ArticleNavigationProps) {
  const title = (article: ArticleDTO) => previewText(article.aiTitleJa) || article.title;
  return (
    <nav className="reader-article-navigation" aria-label="記事を読み進める">
      <div className="reader-navigation-heading"><span>続けて読む</span><span>現在の一覧の順番</span></div>
      <div className="reader-navigation-buttons">
        <button type="button" disabled={!previousArticle} onClick={() => previousArticle && onNavigate(previousArticle)}>
          <span className="reader-navigation-direction">← 前の記事</span>
          <span className="reader-navigation-title">{previousArticle ? title(previousArticle) : "最初の記事です"}</span>
        </button>
        <button type="button" disabled={!nextArticle && (!hasMore || loadingMore)} onClick={() => nextArticle ? onNavigate(nextArticle) : onLoadMore()}>
          <span className="reader-navigation-direction">{nextArticle ? "次の記事 →" : hasMore ? loadingMore ? "読み込み中…" : loadMoreError ? "再試行 →" : "続きを読み込む →" : "次の記事 →"}</span>
          <span className="reader-navigation-title">{nextArticle ? title(nextArticle) : hasMore ? "この一覧の続きを取得します" : "最後の記事です"}</span>
        </button>
      </div>
      {loadMoreError && <p className="reader-navigation-error" role="alert">{loadMoreError}</p>}
    </nav>
  );
}
