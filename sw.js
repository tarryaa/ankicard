/**
 * オフラインでも動くようにするための Service Worker。
 * 同一オリジンの GET を stale-while-revalidate でキャッシュする。
 * （Electron 版では登録しないので、この処理は PWA のときだけ動く）
 */
const CACHE = 'ankicard-v1';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);

      const fromNetwork = fetch(req)
        .then((res) => {
          if (res && res.ok) cache.put(req, res.clone());
          return res;
        })
        .catch(() => null);

      // ページ本体（index.html）はネットワーク優先。
      // こうしないと、アプリを更新しても古い画面が出続けてしまう。
      if (req.mode === 'navigate') {
        const res = await fromNetwork;
        if (res) return res;
        const fallback = (await cache.match(req)) || (await cache.match('./index.html'));
        if (fallback) return fallback;
        return new Response('オフラインです', { status: 503, statusText: 'Offline' });
      }

      // JS/CSS/画像はファイル名にハッシュが付くのでキャッシュ優先でよい
      const cached = await cache.match(req);
      if (cached) return cached;

      const res = await fromNetwork;
      if (res) return res;
      return new Response('オフラインです', { status: 503, statusText: 'Offline' });
    })()
  );
});
