const CACHE_NAME = 'driveflix-v6'; // Version bumped to ensure update
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  '/css/style.css',
  '/js/script.js',
  '/images/circular_menu_button.jpg',
  '/images/pwa_icon-48.png',
  '/images/pwa_icon-72.png',
  '/images/pwa_icon-96.png',
  '/images/pwa_icon-144.png',
  '/images/pwa_icon-192.png',
  'https://via.placeholder.com/300x450/1e1e1e/ffffff?text=No+Poster'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(urlsToCache))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Skip cross-origin requests that aren't for the placeholder
  if (!event.request.url.startsWith(self.location.origin) && !event.request.url.startsWith('https://via.placeholder.com')) {
    return;
  }
  
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        if (response) {
          return response;
        }
        
        return fetch(event.request).then((response) => {
          // Check if we received a valid response
          if (!response || response.status !== 200) {
            return response;
          }
          
          // Clone the response if it's a cacheable type
          if (response.type === 'basic' || event.request.url.startsWith('https://via.placeholder.com')) {
              const responseToCache = response.clone();
              
              caches.open(CACHE_NAME)
                .then((cache) => {
                  cache.put(event.request, responseToCache);
                });
          }
            
          return response;
        });
      })
  );
});