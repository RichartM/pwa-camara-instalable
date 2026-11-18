/* Service Worker - Estrategia Cache First
   install  -> precachea los archivos base
   activate -> borra cachés de versiones anteriores
   fetch    -> responde desde caché; si no está, va a la red */

// Cambia la versión cada vez que modifiques archivos para forzar actualización
const NOMBRE_CACHE = 'inspeccion-pwa-v1';

const ARCHIVOS_PRECACHE = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(NOMBRE_CACHE)
      .then((cache) => cache.addAll(ARCHIVOS_PRECACHE))
      .then(() => self.skipWaiting()) // activa la nueva versión sin esperar
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((nombres) => Promise.all(
        nombres
          .filter((nombre) => nombre !== NOMBRE_CACHE)
          .map((nombre) => caches.delete(nombre))
      ))
      .then(() => self.clients.claim()) // toma control de las pestañas abiertas
  );
});

self.addEventListener('fetch', (event) => {
  // Solo GET del mismo origen (no interfiere con otros recursos)
  if (event.request.method !== 'GET') return;
  if (new URL(event.request.url).origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request, { ignoreSearch: true })
      .then((respuestaCache) => {
        if (respuestaCache) return respuestaCache; // Cache First

        return fetch(event.request)
          .then((respuestaRed) => {
            // Guarda copia de respuestas válidas para la próxima vez
            if (respuestaRed && respuestaRed.ok) {
              const copia = respuestaRed.clone();
              caches.open(NOMBRE_CACHE).then((cache) => cache.put(event.request, copia));
            }
            return respuestaRed;
          })
          .catch(() => {
            // Sin red: si era navegación, devolvemos la página principal
            if (event.request.mode === 'navigate') {
              return caches.match('./index.html');
            }
          });
      })
  );
});
