const CACHE_NAME = "yomu-v3";
const IMAGE_CACHE_NAME = "yomu-images-v1";
const MAX_IMAGE_CACHE_ENTRIES = 300;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME && k !== IMAGE_CACHE_NAME)
          .map((k) => caches.delete(k)),
      )
    )
  );
  self.clients.claim();
});

async function pruneImageCache() {
  const cache = await caches.open(IMAGE_CACHE_NAME);
  const keys = await cache.keys();
  if (keys.length <= MAX_IMAGE_CACHE_ENTRIES) return;
  await Promise.all(
    keys.slice(0, keys.length - MAX_IMAGE_CACHE_ENTRIES).map((request) => cache.delete(request)),
  );
}

async function imageCacheFirst(request) {
  const cache = await caches.open(IMAGE_CACHE_NAME);
  const cached = await cache.match(request, { ignoreVary: true });
  if (cached) return cached;

  const res = await fetch(request);
  if (res.ok || res.type === "opaque") {
    cache.put(request, res.clone()).then(pruneImageCache).catch(() => {});
  }
  return res;
}

self.addEventListener("fetch", (e) => {
  // GET以外はパススルー
  if (e.request.method !== "GET") return;
  if (e.request.destination === "image") {
    e.respondWith(imageCacheFirst(e.request));
    return;
  }
  // API呼び出しとナビゲーション(HTML)はパススルー
  if (e.request.url.includes("/api/")) return;
  if (e.request.mode === "navigate") return;
  // 画像以外は同一オリジンの静的アセットのみキャッシュ対象
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
