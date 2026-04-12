import { db } from "../db";
import { xLikes } from "../db/schema";
import { getXAccessToken } from "./auth";

export async function fetchAndStoreLikes(maxResults: number = 100): Promise<number> {
  const token = getXAccessToken();
  if (!token) throw new Error("X not connected");

  // 1. GET /2/users/me で自分のユーザーIDを取得
  const meRes = await fetch("https://api.x.com/2/users/me", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!meRes.ok) throw new Error(`X API /users/me error: ${meRes.status}`);
  const me = await meRes.json();
  const userId = me.data.id;

  // 2. GET /2/users/:id/liked_tweets でいいね一覧取得
  const params = new URLSearchParams({
    max_results: String(Math.min(maxResults, 100)),
    "tweet.fields": "created_at,public_metrics,entities,attachments",
    "user.fields": "name,username,profile_image_url",
    expansions: "author_id",
  });
  const likesRes = await fetch(`https://api.x.com/2/users/${userId}/liked_tweets?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!likesRes.ok) throw new Error(`X API /liked_tweets error: ${likesRes.status}`);
  const likesData = await likesRes.json();

  const tweets = likesData.data ?? [];
  const users = likesData.includes?.users ?? [];
  const userMap = new Map(users.map((u: any) => [u.id, u]));

  let stored = 0;
  const now = Date.now();
  for (const tweet of tweets) {
    const author = userMap.get(tweet.author_id) as any;
    const result = db.insert(xLikes).values({
      id: tweet.id,
      authorName: author?.name ?? "unknown",
      authorUsername: author?.username ?? "unknown",
      authorProfileImageUrl: author?.profile_image_url ?? null,
      text: tweet.text,
      likedAt: now,
      tweetCreatedAt: tweet.created_at ? Date.parse(tweet.created_at) : null,
      urls: tweet.entities?.urls ? JSON.stringify(tweet.entities.urls.map((u: any) => u.expanded_url)) : null,
      mediaUrls: null, // X API v2 media handling is complex, skip for now
      replyCount: tweet.public_metrics?.reply_count ?? null,
      retweetCount: tweet.public_metrics?.retweet_count ?? null,
      likeCount: tweet.public_metrics?.like_count ?? null,
    }).onConflictDoNothing().run();
    if (result.changes > 0) stored++;
  }
  return stored;
}
