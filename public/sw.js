const CACHE_NAME = 'sobermap-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/app.js',
  '/style.css',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/1.5.3/leaflet.markercluster.js',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/1.5.3/MarkerCluster.css',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/1.5.3/MarkerCluster.Default.css',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css'
];

// Установка: кэшируем shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// Активация: чистим старые кэши
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// Помощники
const isApiRequest = (url) => url.pathname.startsWith('/api/');
const isGeocodeRequest = (url) =>
  url.hostname.includes('photon.komoot.io') ||
  url.hostname.includes('nominatim.openstreetmap.org');

// Стратегия: Cache First (для статики)
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(CACHE_NAME);
    cache.put(request, response.clone());
  }
  return response;
}

// Стратегия: Stale While Revalidate (для API списка заведений)
async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request).then((response) => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => cached);

  return cached || fetchPromise;
}

// Стратегия: Network First с таймаутом (для геокодинга)
async function networkFirstWithTimeout(request, timeoutMs = 3000) {
  const cache = await caches.open(CACHE_NAME);

  return new Promise((resolve) => {
    let resolved = false;

    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        cache.match(request).then((cached) => {
          resolve(cached || new Response(JSON.stringify({ offline: true }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' }
          }));
        });
      }
    }, timeoutMs);

    fetch(request).then((response) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        if (response.ok) cache.put(request, response.clone());
        resolve(response);
      }
    }).catch(() => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        cache.match(request).then((cached) => {
          resolve(cached || new Response(JSON.stringify({ offline: true }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' }
          }));
        });
      }
    });
  });
}

// Fetch
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // API: список заведений (GET) — Stale While Revalidate
  if (isApiRequest(url) && request.method === 'GET') {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  // API: POST/DELETE/PATCH — только сеть (не кэшируем)
  if (isApiRequest(url) && request.method !== 'GET') {
    return;
  }

  // Геокодинг — Network First с таймаутом
  if (isGeocodeRequest(url)) {
    event.respondWith(networkFirstWithTimeout(request));
    return;
  }

  // Статика (CSS, JS, шрифты, иконки) — Cache First
  if (request.destination === 'style' || 
      request.destination === 'script' || 
      request.destination === 'font' ||
      request.destination === 'image' ||
      url.pathname.match(/\.(css|js|png|jpg|jpeg|svg|woff|woff2)$/)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // HTML — Network First
  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/index.html'))
    );
    return;
  }
});

// Push-уведомления (заглушка — можно подключить позже)
self.addEventListener('push', (event) => {
  const data = event.data?.json() || {};
  event.waitUntil(
    self.registration.showNotification(data.title || 'Трезвая Карта', {
      body: data.body || 'Новое заведение добавлено!',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: data.url || '/'
    })
  );
});

// Клик по уведомлению
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((clientList) => {
      const url = event.notification.data || '/';
      for (const client of clientList) {
        if (client.url === url && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
