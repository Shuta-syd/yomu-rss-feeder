export type ReadFilter = "all" | "unread" | "read";

export interface BuildArticlesParamsInput {
  feedId?: string | null;
  category?: string | null;
  search?: string;
  readFilter?: ReadFilter;
  view?: "feeds" | "starred";
  cursor?: string | null;
}

export function buildArticlesParams(input: BuildArticlesParamsInput): URLSearchParams {
  const params = new URLSearchParams();

  if (input.feedId) {
    params.set("feedId", input.feedId);
  } else if (input.category) {
    params.set("category", input.category);
  }

  if (input.readFilter === "unread") {
    params.set("isRead", "false");
  } else if (input.readFilter === "read") {
    params.set("isRead", "true");
  }

  if (input.view === "starred") {
    params.set("isStarred", "true");
  }

  if (input.search) {
    const trimmed = input.search.trim();
    if (trimmed) params.set("search", trimmed);
  }

  if (input.cursor) {
    params.set("cursor", input.cursor);
  }

  return params;
}
