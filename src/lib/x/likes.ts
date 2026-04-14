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
    "media.fields": "type,url,preview_image_url,width,height",
    expansions: "author_id,attachments.media_keys",
  });
  const likesRes = await fetch(`https://api.x.com/2/users/${userId}/liked_tweets?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!likesRes.ok) throw new Error(`X API /liked_tweets error: ${likesRes.status}`);
  const likesData = await likesRes.json();

  const tweets = likesData.data ?? [];
  const users = likesData.includes?.users ?? [];
  const media = likesData.includes?.media ?? [];
  const userMap = new Map(users.map((u: any) => [u.id, u]));
  const mediaMap = new Map(media.map((m: any) => [m.media_key, m]));

  let stored = 0;
  const now = Date.now();
  for (const tweet of tweets) {
    const author = userMap.get(tweet.author_id) as any;

    // URLs: t.co -> expanded + display + title/description/images
    const urlEntities = (tweet.entities?.urls ?? []).map((u: any) => ({
      url: u.url,
      expanded: u.expanded_url,
      display: u.display_url,
      title: u.title ?? null,
      description: u.description ?? null,
      image: u.images?.[0]?.url ?? null,
    }));

    // Media attachments
    const mediaItems = (tweet.attachments?.media_keys ?? [])
      .map((key: string) => mediaMap.get(key))
      .filter(Boolean)
      .map((m: any) => ({
        type: m.type,
        url: m.url ?? m.preview_image_url ?? null,
        width: m.width ?? null,
        height: m.height ?? null,
      }));

    const values = {
      id: tweet.id,
      authorName: author?.name ?? "unknown",
      authorUsername: author?.username ?? "unknown",
      authorProfileImageUrl: author?.profile_image_url ?? null,
      text: tweet.text,
      likedAt: now,
      tweetCreatedAt: tweet.created_at ? Date.parse(tweet.created_at) : null,
      urls: urlEntities.length ? JSON.stringify(urlEntities) : null,
      mediaUrls: mediaItems.length ? JSON.stringify(mediaItems) : null,
      replyCount: tweet.public_metrics?.reply_count ?? null,
      retweetCount: tweet.public_metrics?.retweet_count ?? null,
      likeCount: tweet.public_metrics?.like_count ?? null,
    };
    // likedAt は上書きしない (初回いいね時刻を保持)
    const result = db.insert(xLikes)
      .values(values)
      .onConflictDoUpdate({
        target: xLikes.id,
        set: {
          authorName: values.authorName,
          authorUsername: values.authorUsername,
          authorProfileImageUrl: values.authorProfileImageUrl,
          text: values.text,
          tweetCreatedAt: values.tweetCreatedAt,
          urls: values.urls,
          mediaUrls: values.mediaUrls,
          replyCount: values.replyCount,
          retweetCount: values.retweetCount,
          likeCount: values.likeCount,
        },
      })
      .run();
    if (result.changes > 0) stored++;
  }
  return stored;
}
