import webpush from "web-push";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { pushSubscriptions } from "./db/schema";
import { v7 as uuidv7 } from "uuid";

export function initVapid(): void {
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return;
  webpush.setVapidDetails("mailto:yomu@localhost", pub, priv);
}

export function getVapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY ?? null;
}

export function saveSubscription(endpoint: string, p256dh: string, auth: string): void {
  db.insert(pushSubscriptions)
    .values({ id: uuidv7(), endpoint, keysP256dh: p256dh, keysAuth: auth })
    .onConflictDoNothing()
    .run();
}

export function removeSubscription(endpoint: string): void {
  db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint)).run();
}

export async function sendPushToAll(title: string, body: string, url: string = "/feeds"): Promise<void> {
  const pub = process.env.VAPID_PUBLIC_KEY;
  if (!pub) return; // VAPID未設定なら何もしない

  const subs = db.select().from(pushSubscriptions).all();
  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.keysP256dh, auth: sub.keysAuth } },
        JSON.stringify({ title, body, url }),
      );
    } catch {
      // 失効したsubscription削除
      db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id)).run();
    }
  }
}
