/* PhotoBooth · Sara Sofía XV — service worker: la cabina funciona sin internet.
   Con Wi-Fi Direct el iPad pierde internet, así que todo (página, audios,
   plantilla) queda cacheado en la primera instalación. */
const CACHE = 'photobooth-v7'; // SUBIR en cada cambio de código, si no el iPad sirve la versión vieja
const ASSETS = [
  './',
  'index.html',
  'styles.css',
  'app.js',
  'config.json',
  'manifest.json',
  'assets/audio/01-ambiente.mp3',
  'assets/audio/02-intro.mp3',
  'assets/audio/03-countdown.mp3',
  'assets/audio/04-transicion.mp3',
  'assets/audio/05-final.mp3',
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png',
  'assets/icons/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, copy));
          return res;
        })
        .catch(() => caches.match('index.html'));
    })
  );
});
