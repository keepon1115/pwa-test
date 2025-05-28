const CACHE_NAME = 'claft-quest-map-v1.2'; // キャッシュ名を更新（バージョン管理のため）
const urlsToCache = [
  './', // index.html を示す
  './index.html',
  // './style.css', // CSSを別ファイルにする場合はここに追加
  // './script.js', // JSを別ファイルにする場合はここに追加
  'https://fonts.googleapis.com/css2?family=DotGothic16&family=M+PLUS+Rounded+1c:wght@400;700&display=swap',
  'https://fonts.gstatic.com/s/dotgothic16/v18/v6-gO5dK4v7JJYAG3GLrPhiIlw.woff2', // フォントファイルの実体 (ブラウザ開発ツールで確認して追加)
  'https://fonts.gstatic.com/s/mplusrounded1c/v21/VdGKINgfAbc4f2KI7gXwD5r_2Q.woff2', // フォントファイルの実体
  // アプリで使用する主要な画像アセットがあればここに追加
  // 例: 'icons/icon-192x192.png',
  // 例: 'images/stage1-icon.png',
];

// インストール処理
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache:', CACHE_NAME);
        return cache.addAll(urlsToCache);
      })
      .catch(err => {
        console.error('Failed to open cache or add URLs:', err);
      })
  );
  self.skipWaiting(); // 新しいService Workerをすぐに有効化
});

// 古いキャッシュの削除
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.filter(cacheName => {
          // CACHE_NAME と異なるキャッシュを削除
          return cacheName !== CACHE_NAME;
        }).map(cacheName => {
          console.log('Deleting old cache:', cacheName);
          return caches.delete(cacheName);
        })
      );
    })
  );
  return self.clients.claim(); // 新しいService Workerがすぐにページを制御できるようにする
});

// リクエスト処理 (キャッシュファースト戦略)
self.addEventListener('fetch', event => {
  // Adalo APIへのリクエストはキャッシュしない (常に最新情報を取得)
  if (event.request.url.includes('api.adalo.com')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Google Fontsのキャッシュ戦略 (Stale-While-Revalidateに近い)
  if (event.request.url.startsWith('https://fonts.googleapis.com') || event.request.url.startsWith('https://fonts.gstatic.com')) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cachedResponse = await cache.match(event.request);
        const fetchedResponse = fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.ok) { // ネットワークから取得成功時のみキャッシュ更新
            cache.put(event.request, networkResponse.clone());
          }
          return networkResponse;
        }).catch(() => {
            // ネットワークエラー時はキャッシュを返す (もしあれば)
            return cachedResponse;
        });
        return cachedResponse || fetchedResponse;
      })
    );
    return;
  }
  
  // その他のリクエストはキャッシュファースト
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // キャッシュがあればそれを返す
        if (response) {
          return response;
        }
        // キャッシュがなければネットワークから取得し、キャッシュにも保存
        return fetch(event.request).then(
          networkResponse => {
            if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
              return networkResponse; // 有効でないレスポンスはそのまま返す
            }
            // レスポンスをクローンしてキャッシュに保存
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME)
              .then(cache => {
                cache.put(event.request, responseToCache);
              });
            return networkResponse;
          }
        );
      })
      .catch(error => {
        // ネットワークもキャッシュも利用できない場合のフォールバック (オフラインページなど)
        console.error('Fetching failed:', error);
        // return caches.match('./offline.html'); // オフライン用のHTMLがあれば
      })
  );
});