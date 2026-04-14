const CACHE_NAME = "yomu-v2";

self.addEventListener("install", (e) => {
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  // GET以外はパススルー
  if (e.request.method !== "GET") return;
  // API呼び出しとナビゲーション(HTML)はパススルー
  if (e.request.url.includes("/api/")) return;
  if (e.request.mode === "navigate") return;
  // 同一オリジンのみキャッシュ対象 (クロスオリジン画像等は触らない)
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;
  // 静的アセットのみ: network-first, offline fallback to cache
  e.respondWith(
    fetch(e.request).then((res) => {
      if (res.ok) {
        const clone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
      }
      return res;
    }).catch(() => caches.match(e.request))
  );
});

// Push通知
self.addEventListener("push", (e) => {
  const data = e.data?.json() ?? { title: "Yomu", body: "新しい記事があります" };
  e.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: data.url ?? "/feeds" },
    })
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(clients.openWindow(e.notification.data.url));
});
